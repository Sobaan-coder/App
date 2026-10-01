import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/app_bottom_sheet.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../products/domain/product.dart';
import '../data/inventory_repository.dart';
import '../domain/inventory_movement.dart';

/// Records WHY stock changed (waste, damage, return, count correction...).
Future<void> showAdjustStockSheet(BuildContext context, Product product) =>
    showAppBottomSheet(context, title: 'Adjust stock · ${product.name}', child: _AdjustStock(product: product));

class _AdjustStock extends ConsumerStatefulWidget {
  const _AdjustStock({required this.product});
  final Product product;
  @override
  ConsumerState<_AdjustStock> createState() => _AdjustStockState();
}

class _AdjustStockState extends ConsumerState<_AdjustStock> {
  MovementType _type = MovementType.waste;
  bool _increase = false;
  final _qty = TextEditingController();
  final _note = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(businessProvider).role;
    final allowed = MovementType.manual.where((t) =>
        role.canEditCatalogue || t == MovementType.waste || t == MovementType.damage || t == MovementType.return_).toList();
    final forcedSign = switch (_type) {
      MovementType.waste || MovementType.damage => false,
      MovementType.return_ || MovementType.opening => true,
      _ => null,
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Current stock: ${Fmt.qty(widget.product.stockQuantity)} ${widget.product.unit}'),
      const SizedBox(height: Gap.lg),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final t in allowed)
          ChoiceChip(avatar: Icon(t.icon, size: 18), label: Text(t.label), selected: _type == t, onSelected: (_) => setState(() => _type = t)),
      ]),
      if (forcedSign == null) ...[
        const SizedBox(height: Gap.lg),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('Add'), icon: Icon(Icons.add_rounded)),
            ButtonSegment(value: false, label: Text('Remove'), icon: Icon(Icons.remove_rounded)),
          ],
          selected: {_increase},
          onSelectionChanged: (s) => setState(() => _increase = s.first),
        ),
      ],
      const SizedBox(height: Gap.lg),
      AppTextField(label: 'Quantity (${widget.product.unit})', controller: _qty, autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true)),
      const SizedBox(height: Gap.md),
      AppTextField(label: 'Note (optional)', controller: _note),
      const SizedBox(height: Gap.xl),
      AppButton(
        label: 'Save adjustment',
        loading: _saving,
        expand: true,
        onPressed: () async {
          final q = double.tryParse(_qty.text.trim());
          if (q == null || q <= 0) return showMessage(context, 'Enter a quantity greater than zero');
          final up = forcedSign ?? _increase;
          setState(() => _saving = true);
          try {
            final stock = await ref.read(inventoryRepositoryProvider)
                .adjust(widget.product.id, _type, up ? q : -q, note: _note.text.trim().isEmpty ? null : _note.text.trim());
            if (context.mounted) {
              Navigator.pop(context);
              showMessage(context, 'Stock updated — now ${Fmt.qty(stock)} ${widget.product.unit}');
            }
          } catch (e) {
            if (context.mounted) showError(context, e);
          } finally {
            if (mounted) setState(() => _saving = false);
          }
        },
      ),
    ]);
  }
}
