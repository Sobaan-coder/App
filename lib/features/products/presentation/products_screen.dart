import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/product_card.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../data/product_repository.dart';
import 'barcode_scanner_screen.dart';

class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key});
  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  String _q = '';

  Future<void> _scan() async {
    final code = await scanBarcode(context);
    if (code == null || !mounted) return;
    final p = await ref.read(productRepositoryProvider).byBarcode(code);
    if (!mounted) return;
    if (p != null) {
      context.push('/products/${p.id}');
    } else {
      context.push('/products/new?barcode=${Uri.encodeComponent(code)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessProvider);
    final products = ref.watch(productsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.navProducts), actions: [
        if (business.flags.barcodeEnabled)
          IconButton(tooltip: 'Scan barcode', onPressed: _scan, icon: const Icon(Icons.qr_code_scanner_rounded)),
        const ShellActions(),
      ]),
      floatingActionButton: business.role.canEditCatalogue
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/products/new'), icon: const Icon(Icons.add_rounded), label: const Text('Product'))
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Search name, SKU or barcode', prefixIcon: Icon(Icons.search_rounded)),
            onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
          ),
        ),
        Expanded(
          child: AsyncView(
            value: products,
            onRetry: () => ref.invalidate(productsProvider),
            builder: (list) {
              final filtered = list.where((p) => _q.isEmpty || p.name.toLowerCase().contains(_q) ||
                  (p.sku ?? '').toLowerCase().contains(_q) || (p.barcode ?? '') == _q).toList();
              if (list.isEmpty) {
                return EmptyState(
                  icon: Icons.sell_outlined,
                  title: 'No products yet',
                  message: 'Add what you sell so sales update your stock and profit automatically.',
                  actionLabel: business.role.canEditCatalogue ? 'Add product' : null,
                  onAction: () => context.push('/products/new'),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.only(bottom: 96),
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const Divider(indent: 72),
                itemBuilder: (_, i) => ProductCard(product: filtered[i], onTap: () => context.push('/products/${filtered[i].id}')),
              );
            },
          ),
        ),
      ]),
    );
  }
}
