import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/services/analytics_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/money_field.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../products/domain/product.dart';
import 'ai_demo.dart';

/// Welcome → name → type → currency → first product → opening balance → AI demo → done.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key, this.addingAnother = false});
  final bool addingAnother;

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  late int _step = widget.addingAnother ? 1 : 0;
  static const _steps = 8;
  final _name = TextEditingController();
  String _type = 'restaurant';
  String _currency = 'PKR';
  String _timezone = 'Asia/Karachi';
  String? _businessId;
  bool _busy = false;

  final _productName = TextEditingController();
  final _productPrice = TextEditingController();
  final _productCost = TextEditingController();
  final _productStock = TextEditingController();
  final _openingCash = TextEditingController();

  @override
  void dispose() {
    for (final c in [_name, _productName, _productPrice, _productCost, _productStock, _openingCash]) {
      c.dispose();
    }
    super.dispose();
  }

  void _next() => setState(() => _step = (_step + 1).clamp(0, _steps - 1));
  void _back() => setState(() => _step = (_step - 1).clamp(0, _steps - 1));

  Future<void> _guard(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createBusiness() => _guard(() async {
        final repo = ref.read(businessRepositoryProvider);
        _businessId ??= await repo.createBusiness(name: _name.text.trim(), type: _type, currency: _currency, timezone: _timezone);
        await ref.read(currentBusinessIdProvider.notifier).select(_businessId!);
        ref.invalidate(membershipsProvider);
        _next();
      });

  Future<void> _saveProduct() => _guard(() async {
        if (_productName.text.trim().isEmpty) return _next();
        final price = Money.tryParse(_productPrice.text, _currency);
        if (price == null) throw const FormatException('price');
        final cost = _productCost.text.trim().isEmpty ? null : Money.tryParse(_productCost.text, _currency);
        await ref.read(businessRepositoryProvider).createFirstProduct(
          _businessId!,
          Product(id: '', businessId: _businessId!, name: _productName.text.trim(), currency: _currency,
              sellingPrice: price, costPrice: cost),
          double.tryParse(_productStock.text.trim()) ?? 0,
        );
        _next();
      });

  Future<void> _saveOpening() => _guard(() async {
        final m = MoneyField.read(_openingCash, _currency);
        if (m != null && m.minor > 0) await ref.read(businessRepositoryProvider).setOpeningCash(_businessId!, m.minor);
        _next();
      });

  Future<void> _openDemo() => _guard(() async {
        final id = await ref.read(businessRepositoryProvider).createDemoBusiness();
        await ref.read(currentBusinessIdProvider.notifier).select(id);
        ref.read(analyticsProvider).track('demo_opened', businessId: id);
        ref.invalidate(membershipsProvider);
        if (mounted) context.go('/');
      });

  void _finish({String to = '/'}) {
    ref.read(analyticsProvider).track('onboarding_completed', businessId: _businessId);
    ref.invalidate(membershipsProvider);
    context.go(to);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Padding(
              padding: const EdgeInsets.all(Gap.xl),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  if (_step > 0 && _step < 4 && !_busy)
                    IconButton(tooltip: 'Back', onPressed: _back, icon: const Icon(Icons.arrow_back_rounded))
                  else
                    const BrandMark(size: 32),
                  const SizedBox(width: Gap.md),
                  Expanded(
                    child: Semantics(
                      label: 'Step ${_step + 1} of $_steps',
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(value: (_step + 1) / _steps, minHeight: 6),
                      ),
                    ),
                  ),
                ]),
                const SizedBox(height: Gap.xxl),
                Expanded(child: SingleChildScrollView(child: _body(t))),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _title(ThemeData t, String title, [String? sub]) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(header: true, child: Text(title, style: t.textTheme.headlineMedium)),
        if (sub != null) ...[
          const SizedBox(height: Gap.sm),
          Text(sub, style: t.textTheme.bodyLarge?.copyWith(color: t.colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: Gap.xl),
      ]);

  Widget _body(ThemeData t) {
    switch (_step) {
      case 0:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Center(child: BrandMark(size: 72)),
          const SizedBox(height: Gap.xl),
          _title(t, 'Welcome to BusinessPilot', 'Let’s set up your business. It takes about a minute.'),
          AppButton(label: 'Get started', onPressed: _next, expand: true),
          const SizedBox(height: Gap.md),
          AppButton(label: 'Explore a demo cafe first', variant: AppButtonVariant.secondary, loading: _busy,
              onPressed: _openDemo, expand: true, icon: Icons.storefront_rounded),
        ]);
      case 1:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'What’s your business called?'),
          AppTextField(label: 'Business name', controller: _name, autofocus: true, hint: 'e.g. My Restaurant',
              textCapitalization: TextCapitalization.words, onSubmitted: (_) => _name.text.trim().isNotEmpty ? _next() : null),
          const SizedBox(height: Gap.xl),
          ListenableBuilder(
            listenable: _name,
            builder: (_, _) => AppButton(label: 'Next', onPressed: _name.text.trim().isEmpty ? null : _next, expand: true),
          ),
        ]);
      case 2:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'What kind of business is it?', 'We’ll tailor suggestions to you.'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in AppConstants.businessTypes.entries)
              ChoiceChip(label: Text(e.value), selected: _type == e.key, onSelected: (_) => setState(() => _type = e.key)),
          ]),
          const SizedBox(height: Gap.xl),
          AppButton(label: 'Next', onPressed: _next, expand: true),
        ]);
      case 3:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'Which currency do you use?', 'All amounts will be recorded in this currency.'),
          DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: const InputDecoration(labelText: 'Currency'),
            items: [for (final c in AppConstants.currencies) DropdownMenuItem(value: c, child: Text('$c  ${Money.symbolFor(c)}'))],
            onChanged: (v) => setState(() {
              _currency = v!;
              _timezone = AppConstants.currencyTimezones[v] ?? _timezone;
            }),
          ),
          const SizedBox(height: Gap.lg),
          DropdownButtonFormField<String>(
            key: ValueKey(_timezone),
            initialValue: _timezone,
            decoration: const InputDecoration(labelText: 'Time zone', helperText: 'Used for “today” in reports'),
            items: [for (final z in {...AppConstants.timezones, _timezone}) DropdownMenuItem(value: z, child: Text(z))],
            onChanged: (v) => setState(() => _timezone = v!),
          ),
          const SizedBox(height: Gap.xl),
          AppButton(label: 'Create my business', onPressed: _createBusiness, loading: _busy, expand: true),
        ]);
      case 4:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'Add your first product', 'Something you sell — e.g. Burger. You can add more later.'),
          AppTextField(label: 'Product name', controller: _productName, textCapitalization: TextCapitalization.words),
          const SizedBox(height: Gap.lg),
          MoneyField(controller: _productPrice, currency: _currency, label: 'Selling price', required: false),
          const SizedBox(height: Gap.lg),
          MoneyField(controller: _productCost, currency: _currency, label: 'Cost price (optional)', required: false,
              helper: 'Needed to calculate profit'),
          const SizedBox(height: Gap.lg),
          AppTextField(label: 'Current stock (optional)', controller: _productStock, keyboardType: TextInputType.number),
          const SizedBox(height: Gap.xl),
          AppButton(label: 'Save & continue', onPressed: _saveProduct, loading: _busy, expand: true),
          TextButton(onPressed: _next, child: const Text('Skip for now')),
        ]);
      case 5:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'How much cash do you have now?', 'Your opening cash balance. Optional.'),
          MoneyField(controller: _openingCash, currency: _currency, label: 'Cash in hand', required: false, allowZero: true),
          const SizedBox(height: Gap.xl),
          AppButton(label: 'Continue', onPressed: _saveOpening, loading: _busy, expand: true),
          TextButton(onPressed: _next, child: const Text('Skip')),
        ]);
      case 6:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _title(t, 'Try telling BusinessPilot what happened.', 'Type it like you’d say it. We turn it into a record.'),
          AiDemo(currencySymbol: Money.symbolFor(_currency), onTryForReal: () => _finish(to: '/ai')),
          const SizedBox(height: Gap.xl),
          AppButton(label: 'Next', onPressed: _next, expand: true),
        ]);
      default:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Icon(Icons.check_circle_rounded, size: 72, color: t.colorScheme.primary),
          const SizedBox(height: Gap.xl),
          _title(t, 'You’re all set!', '${_name.text.trim().isEmpty ? 'Your business' : _name.text.trim()} is ready. '
              'Tell BusinessPilot what happens through the day — sales, purchases, expenses, who owes you.'),
          AppButton(label: 'Go to my dashboard', onPressed: _finish, expand: true),
        ]);
    }
  }
}
