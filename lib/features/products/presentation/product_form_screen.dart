import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/confirm_dialog.dart';
import '../../../shared/widgets/money_field.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../inventory/data/inventory_repository.dart';
import '../../inventory/presentation/adjust_stock_sheet.dart';
import '../data/product_repository.dart';
import '../domain/product.dart';
import 'barcode_scanner_screen.dart';

/// Create (id == null) or edit a product. Editing also shows stock history.
class ProductFormScreen extends ConsumerWidget {
  const ProductFormScreen({super.key, this.id, this.barcode});
  final String? id;
  final String? barcode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (id == null) return _ProductForm(barcode: barcode);
    return AsyncView<Product>(
      value: ref.watch(productProvider(id!)),
      onRetry: () => ref.invalidate(productProvider(id!)),
      loading: const Scaffold(body: LoadingState()),
      builder: (p) => _ProductForm(product: p),
    );
  }
}

class _ProductForm extends ConsumerStatefulWidget {
  const _ProductForm({this.product, this.barcode});
  final Product? product;
  final String? barcode;
  @override
  ConsumerState<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends ConsumerState<_ProductForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.product?.name);
  late final _price = TextEditingController(text: widget.product?.sellingPrice?.toDecimalString());
  late final _cost = TextEditingController(text: widget.product?.costPrice?.toDecimalString());
  late final _sku = TextEditingController(text: widget.product?.sku);
  late final _barcode = TextEditingController(text: widget.product?.barcode ?? widget.barcode);
  late final _min = TextEditingController(text: widget.product == null ? '' : Fmt.qty(widget.product!.minimumStock));
  final _opening = TextEditingController();
  late String _unit = widget.product?.unit ?? 'pcs';
  late bool _track = widget.product?.trackInventory ?? true;
  late bool _active = widget.product?.isActive ?? true;
  bool _saving = false;

  bool get _editing => widget.product != null;

  @override
  void dispose() {
    for (final c in [_name, _price, _cost, _sku, _barcode, _min, _opening]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final b = ref.read(businessProvider);
    final p = Product(
      id: widget.product?.id ?? '',
      businessId: b.id,
      name: _name.text.trim(),
      currency: b.currency,
      sellingPrice: MoneyField.read(_price, b.currency),
      costPrice: MoneyField.read(_cost, b.currency),
      sku: _sku.text,
      barcode: _barcode.text,
      minimumStock: double.tryParse(_min.text) ?? 0,
      unit: _unit,
      trackInventory: _track,
      isActive: _active,
      categoryId: widget.product?.categoryId,
    );
    setState(() => _saving = true);
    try {
      final repo = ref.read(productRepositoryProvider);
      if (_editing) {
        await repo.update(p.id, p.toWritableJson());
      } else {
        await repo.create(p, openingStock: double.tryParse(_opening.text) ?? 0);
      }
      if (mounted) {
        showMessage(context, _editing ? 'Product saved' : 'Product added');
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
    final b = ref.watch(businessProvider);
    final canEdit = b.role.canEditCatalogue;
    final p = widget.product;
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? p!.name : 'New product'), actions: [
        if (_editing && canEdit)
          IconButton(
            tooltip: 'Archive product',
            icon: const Icon(Icons.archive_outlined),
            onPressed: () async {
              if (!await showConfirmDialog(context, title: 'Archive ${p!.name}?',
                  message: 'It will be hidden from lists. Past sales stay intact.', confirmLabel: 'Archive')) {
                return;
              }
              try {
                await ref.read(productRepositoryProvider).archive(p.id);
                if (context.mounted) context.pop();
              } catch (e) {
                if (context.mounted) showError(context, e);
              }
            },
          ),
      ]),
      body: Form(
        key: _form,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(padding: const EdgeInsets.all(Gap.lg), children: [
              if (_editing) ...[
                Card(
                  child: ListTile(
                    leading: Icon(p!.isLowStock ? Icons.warning_amber_rounded : Icons.inventory_2_outlined),
                    title: Text(p.trackInventory ? '${Fmt.qty(p.stockQuantity)} ${p.unit} in stock' : 'Stock not tracked'),
                    subtitle: Text(p.marginBp == null ? 'Add a cost price to see margin' : 'Margin ${(p.marginBp! / 100).toStringAsFixed(1)}%'),
                    trailing: p.trackInventory && b.role.canRecord
                        ? FilledButton.tonal(onPressed: () => showAdjustStockSheet(context, p), child: const Text('Adjust'))
                        : null,
                  ),
                ),
                const SizedBox(height: Gap.lg),
              ],
              AppTextField(label: 'Name', controller: _name, enabled: canEdit, textCapitalization: TextCapitalization.words,
                  validator: (v) => Validators.required(v, 'Name')),
              const SizedBox(height: Gap.lg),
              Row(children: [
                Expanded(child: MoneyField(controller: _price, currency: b.currency, label: 'Selling price', required: false)),
                const SizedBox(width: Gap.md),
                Expanded(child: MoneyField(controller: _cost, currency: b.currency, label: 'Cost price', required: false, allowZero: true)),
              ]),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Cost price is used to calculate profit.', style: Theme.of(context).textTheme.bodySmall),
              ),
              const SizedBox(height: Gap.lg),
              Row(children: [
                Expanded(child: AppTextField(label: 'SKU (optional)', controller: _sku, enabled: canEdit)),
                const SizedBox(width: Gap.md),
                Expanded(
                  child: AppTextField(
                    label: 'Barcode (optional)', controller: _barcode, enabled: canEdit,
                    suffix: b.flags.barcodeEnabled
                        ? IconButton(tooltip: 'Scan', icon: const Icon(Icons.qr_code_scanner_rounded), onPressed: () async {
                            final code = await scanBarcode(context);
                            if (code != null) _barcode.text = code;
                          })
                        : null,
                  ),
                ),
              ]),
              const SizedBox(height: Gap.lg),
              DropdownButtonFormField<String>(
                initialValue: AppConstants.units.contains(_unit) ? _unit : 'pcs',
                decoration: const InputDecoration(labelText: 'Unit'),
                items: [for (final u in AppConstants.units) DropdownMenuItem(value: u, child: Text(u))],
                onChanged: canEdit ? (v) => setState(() => _unit = v!) : null,
              ),
              const SizedBox(height: Gap.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Track stock'),
                subtitle: const Text('Sales and purchases update the stock automatically'),
                value: _track,
                onChanged: canEdit ? (v) => setState(() => _track = v) : null,
              ),
              if (_track) ...[
                Row(children: [
                  if (!_editing) ...[
                    Expanded(child: AppTextField(label: 'Opening stock', controller: _opening, keyboardType: TextInputType.number)),
                    const SizedBox(width: Gap.md),
                  ],
                  Expanded(child: AppTextField(label: 'Low-stock alert at', controller: _min, enabled: canEdit,
                      keyboardType: TextInputType.number)),
                ]),
              ],
              if (_editing)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Active'),
                  value: _active,
                  onChanged: canEdit ? (v) => setState(() => _active = v) : null,
                ),
              const SizedBox(height: Gap.xl),
              if (canEdit) AppButton(label: 'Save product', onPressed: _save, loading: _saving, expand: true),
              if (_editing) ...[
                const SizedBox(height: Gap.xl),
                Text('Stock history', style: Theme.of(context).textTheme.titleMedium),
                _History(productId: p!.id, unit: p.unit),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

class _History extends ConsumerWidget {
  const _History({required this.productId, required this.unit});
  final String productId;
  final String unit;
  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncView(
        value: ref.watch(inventoryHistoryProvider(productId)),
        compact: true,
        builder: (moves) => moves.isEmpty
            ? const Padding(padding: EdgeInsets.all(12), child: Text('No stock movements yet'))
            : Column(children: [
                for (final m in moves)
                  ListTile(
                    dense: true,
                    leading: Icon(m.type.icon),
                    title: Text(m.type.label),
                    subtitle: Text([Fmt.dateTime(m.createdAt), if (m.note != null) m.note!].join(' · ')),
                    trailing: Text('${m.change > 0 ? '+' : ''}${Fmt.qty(m.change)} $unit',
                        style: TextStyle(fontWeight: FontWeight.w700, color: m.change < 0 ? Theme.of(context).colorScheme.error : null)),
                  ),
              ]),
      );
}

