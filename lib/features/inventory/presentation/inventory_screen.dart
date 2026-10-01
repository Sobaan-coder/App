import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/product_card.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../products/data/product_repository.dart';
import 'adjust_stock_sheet.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key, this.lowOnly = false});
  final bool lowOnly;
  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  late bool _lowOnly = widget.lowOnly;

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.navInventory), actions: [
        IconButton(tooltip: 'Products', onPressed: () => context.go('/products'), icon: const Icon(Icons.sell_outlined)),
        const ShellActions(),
      ]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(children: [
            FilterChip(label: const Text('Low stock only'), selected: _lowOnly, onSelected: (v) => setState(() => _lowOnly = v)),
          ]),
        ),
        Expanded(
          child: AsyncView(
            value: ref.watch(productsProvider),
            onRetry: () => ref.invalidate(productsProvider),
            builder: (list) {
              final tracked = list.where((p) => p.trackInventory && p.isActive && (!_lowOnly || p.isLowStock)).toList()
                ..sort((a, b) => (b.isLowStock ? 1 : 0).compareTo(a.isLowStock ? 1 : 0));
              if (tracked.isEmpty) {
                return EmptyState(
                  icon: Icons.inventory_2_outlined,
                  title: _lowOnly ? 'Nothing is running low' : 'No stock-tracked products',
                  message: _lowOnly ? null : 'Add products with stock tracking to manage inventory here.',
                  actionLabel: business.role.canEditCatalogue && !_lowOnly ? 'Add product' : null,
                  onAction: () => context.push('/products/new'),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.only(bottom: 96),
                itemCount: tracked.length,
                separatorBuilder: (_, _) => const Divider(indent: 72),
                itemBuilder: (_, i) => ProductCard(
                  product: tracked[i],
                  onTap: () => context.push('/products/${tracked[i].id}'),
                  trailing: business.role.canRecord
                      ? TextButton(onPressed: () => showAdjustStockSheet(context, tracked[i]), child: const Text('Adjust'))
                      : null,
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
