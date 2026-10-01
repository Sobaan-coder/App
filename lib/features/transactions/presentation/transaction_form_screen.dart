import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/date_selector.dart';
import '../../../shared/widgets/money_field.dart';
import '../../../shared/widgets/pickers.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../customers/domain/contact.dart';
import '../../expenses/data/expense_category_repository.dart';
import '../../products/domain/product.dart';
import '../data/transaction_repository.dart';
import '../domain/transaction.dart';

class _LineItem {
  _LineItem(this.product, {double qty = 1}) : qty = TextEditingController(text: Fmt.qty(qty)),
        price = TextEditingController(text: product.sellingPrice?.toDecimalString() ?? '');
  final Product product;
  final TextEditingController qty;
  final TextEditingController price;
}

/// Manual entry for every transaction type — for people who prefer forms.
class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({super.key, this.type = TransactionType.sale, this.customerId, this.supplierId});
  final TransactionType type;
  final String? customerId;
  final String? supplierId;

  @override
  ConsumerState<TransactionFormScreen> createState() => _TransactionFormScreenState();
}

class _TransactionFormScreenState extends ConsumerState<TransactionFormScreen> {
  final _form = GlobalKey<FormState>();
  late TransactionType _type = widget.type;
  final _amount = TextEditingController();
  final _discount = TextEditingController();
  final _description = TextEditingController();
  final _provider = TextEditingController();
  PaymentMethod _method = PaymentMethod.cash;
  DateTime _date = DateTime.now();
  ContactChoice? _customer;
  ContactChoice? _supplier;
  String? _category;
  ContactKind _adjustmentParty = ContactKind.customer;
  final List<_LineItem> _items = [];
  bool _saving = false;

  // Idempotency key for this form: tapping "Save" twice can never create two entries.
  final String _clientRef = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    if (widget.customerId != null) _customer = ContactChoice(id: widget.customerId, name: '');
    if (widget.supplierId != null) _supplier = ContactChoice(id: widget.supplierId, name: '');
  }

  @override
  void dispose() {
    for (final c in [_amount, _discount, _description, _provider]) {
      c.dispose();
    }
    for (final i in _items) {
      i.qty.dispose();
      i.price.dispose();
    }
    super.dispose();
  }

  bool get _supportsItems => _type == TransactionType.sale || _type == TransactionType.purchase;
  bool get _needsCustomer => _type == TransactionType.paymentReceived ||
      (_type == TransactionType.adjustment && _adjustmentParty == ContactKind.customer) ||
      (_type == TransactionType.sale && _method == PaymentMethod.credit);
  bool get _needsSupplier => _type == TransactionType.paymentSent ||
      (_type == TransactionType.adjustment && _adjustmentParty == ContactKind.supplier) ||
      ((_type == TransactionType.purchase || _type == TransactionType.expense) && _method == PaymentMethod.credit);
  bool get _showCustomer => _needsCustomer || _type == TransactionType.sale || _type == TransactionType.income;
  bool get _showSupplier => _needsSupplier || _type == TransactionType.purchase || _type == TransactionType.expense;

  Money? _itemsTotal(String currency) {
    if (_items.isEmpty) return null;
    var total = Money.zero(currency);
    for (final i in _items) {
      final price = Money.tryParse(i.price.text, currency);
      final qty = double.tryParse(i.qty.text);
      if (price == null || qty == null) return null;
      total = total + price.times(qty);
    }
    return total;
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final business = ref.read(businessProvider);
    final c = business.currency;
    final amount = MoneyField.read(_amount, c);
    final discount = MoneyField.read(_discount, c);
    if (_items.isEmpty && amount == null) return showError(context, 'invalid_input:amount');

    final draftItems = [
      for (final i in _items)
        DraftItem(productId: i.product.id, name: i.product.name, quantity: double.parse(i.qty.text),
            unitPrice: Money.tryParse(i.price.text, c)),
    ];
    final draft = TransactionDraft(
      type: _type,
      amount: _items.isEmpty ? amount : null,
      discount: _items.isEmpty ? null : discount,
      paymentMethod: _type == TransactionType.adjustment ? PaymentMethod.credit : _method,
      paymentProvider: _method == PaymentMethod.wallet || _method == PaymentMethod.card ? _provider.text : null,
      description: _description.text,
      customerId: _showCustomer ? _customer?.id : null,
      customerName: _showCustomer && _customer?.isNew == true ? _customer!.name : null,
      createCustomer: _showCustomer && _customer?.isNew == true,
      supplierId: _showSupplier ? _supplier?.id : null,
      supplierName: _showSupplier && _supplier?.isNew == true ? _supplier!.name : null,
      createSupplier: _showSupplier && _supplier?.isNew == true,
      expenseCategoryName: _type == TransactionType.expense ? (_category ?? 'Other') : null,
      transactionDate: _date,
      items: draftItems,
    );
    setState(() => _saving = true);
    try {
      final res = await ref.read(transactionRepositoryProvider).record(draft, clientRef: _clientRef, summary: draftSummary(draft));
      if (!mounted) return;
      showMessage(context, res.pending
          ? 'Saved offline — it will sync automatically.'
          : '${_type.label} recorded${res.invoiceNumber != null ? ' · ${res.invoiceNumber}' : ''}');
      if (res.id != null && _type == TransactionType.sale) {
        context.pushReplacement('/transactions/${res.id}');
      } else {
        context.pop();
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessProvider);
    final c = business.currency;
    final categories = ref.watch(expenseCategoriesProvider).value ?? const [];
    final itemsTotal = _itemsTotal(c);

    if (!business.role.canRecord) {
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.lock_outline_rounded, title: 'View-only access',
          message: 'Ask the business owner to give you Employee access to record transactions.'));
    }

    return Scaffold(
      appBar: AppBar(title: Text('New ${_type.label.toLowerCase()}')),
      body: Form(
        key: _form,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(padding: const EdgeInsets.all(Gap.lg), children: [
              DropdownButtonFormField<TransactionType>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: [
                  for (final t in TransactionType.values.where((t) => t != TransactionType.transfer && t != TransactionType.refund))
                    DropdownMenuItem(value: t, child: Row(children: [Icon(t.icon, size: 20), const SizedBox(width: 10), Text(t.label)])),
                ],
                onChanged: (t) => setState(() {
                  _type = t!;
                  if (!_supportsItems) _items.clear();
                }),
              ),
              const SizedBox(height: Gap.lg),
              if (_type == TransactionType.adjustment) ...[
                SegmentedButton<ContactKind>(
                  segments: const [
                    ButtonSegment(value: ContactKind.customer, label: Text('Someone owes me'), icon: Icon(Icons.call_received_rounded)),
                    ButtonSegment(value: ContactKind.supplier, label: Text('I owe someone'), icon: Icon(Icons.call_made_rounded)),
                  ],
                  selected: {_adjustmentParty},
                  onSelectionChanged: (s) => setState(() => _adjustmentParty = s.first),
                ),
                const SizedBox(height: Gap.lg),
              ],
              if (_supportsItems) ...[
                Text('Items', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: Gap.sm),
                for (final (idx, item) in _items.indexed)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(Gap.md),
                      child: Column(children: [
                        Row(children: [
                          Expanded(child: Text(item.product.name, style: Theme.of(context).textTheme.titleSmall)),
                          IconButton(tooltip: 'Remove item', icon: const Icon(Icons.close_rounded),
                              onPressed: () => setState(() => _items.removeAt(idx))),
                        ]),
                        Row(children: [
                          Expanded(
                            child: TextFormField(
                              controller: item.qty,
                              decoration: InputDecoration(labelText: 'Quantity (${item.product.unit})'),
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              onChanged: (_) => setState(() {}),
                              validator: (v) => (double.tryParse(v ?? '') ?? 0) > 0 ? null : 'Enter a quantity',
                            ),
                          ),
                          const SizedBox(width: Gap.md),
                          Expanded(
                            child: MoneyField(controller: item.price, currency: c,
                                label: _type == TransactionType.purchase ? 'Unit cost' : 'Unit price',
                                onChanged: (_) => setState(() {})),
                          ),
                        ]),
                      ]),
                    ),
                  ),
                OutlinedButton.icon(
                  onPressed: () async {
                    final p = await pickProduct(context);
                    if (p != null) {
                      setState(() {
                        final li = _LineItem(p);
                        if (_type == TransactionType.purchase) li.price.text = p.costPrice?.toDecimalString() ?? '';
                        _items.add(li);
                      });
                    }
                  },
                  icon: const Icon(Icons.add_rounded),
                  label: Text(_items.isEmpty ? 'Add products (optional)' : 'Add another product'),
                ),
                const SizedBox(height: Gap.lg),
              ],
              if (_items.isEmpty)
                MoneyField(controller: _amount, currency: c, autofocus: true,
                    label: _type == TransactionType.adjustment ? 'Amount owed' : 'Amount')
              else ...[
                MoneyField(controller: _discount, currency: c, label: 'Discount', required: false, allowZero: true),
                const SizedBox(height: Gap.md),
                Text('Total: ${itemsTotal == null ? '—' : (itemsTotal - (MoneyField.read(_discount, c) ?? Money.zero(c))).format()}',
                    style: Theme.of(context).textTheme.titleLarge),
              ],
              const SizedBox(height: Gap.lg),
              if (_type == TransactionType.expense) ...[
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: [for (final cat in categories) DropdownMenuItem(value: cat.name, child: Text(cat.name))],
                  onChanged: (v) => setState(() => _category = v),
                ),
                const SizedBox(height: Gap.lg),
              ],
              if (_type != TransactionType.adjustment) ...[
                Text('Payment', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: Gap.sm),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final m in PaymentMethod.values)
                    ChoiceChip(
                      avatar: Icon(m.icon, size: 18),
                      label: Text(m.label),
                      selected: _method == m,
                      onSelected: (_) => setState(() => _method = m),
                    ),
                ]),
                if (_method == PaymentMethod.wallet || _method == PaymentMethod.card) ...[
                  const SizedBox(height: Gap.md),
                  AppTextField(label: _method == PaymentMethod.wallet ? 'Wallet (e.g. Easypaisa, JazzCash)' : 'Card network (optional)',
                      controller: _provider),
                ],
                const SizedBox(height: Gap.lg),
              ],
              if (_showCustomer) ...[
                ContactPicker(kind: ContactKind.customer, value: _customer, required: _needsCustomer,
                    onChanged: (v) => setState(() => _customer = v)),
                const SizedBox(height: Gap.lg),
              ],
              if (_showSupplier) ...[
                ContactPicker(kind: ContactKind.supplier, value: _supplier, required: _needsSupplier,
                    onChanged: (v) => setState(() => _supplier = v)),
                const SizedBox(height: Gap.lg),
              ],
              DateSelector(value: _date, onChanged: (d) => setState(() => _date = d)),
              const SizedBox(height: Gap.lg),
              AppTextField(label: 'Note (optional)', controller: _description, maxLines: 2),
              const SizedBox(height: Gap.xl),
              AppButton(label: 'Save ${_type.label.toLowerCase()}', onPressed: _save, loading: _saving, expand: true, icon: Icons.check_rounded),
            ]),
          ),
        ),
      ),
    );
  }
}
