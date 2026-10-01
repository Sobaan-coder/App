import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../features/products/domain/product.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, this.onTap, this.trailing});
  final Product product;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final p = product;
    final stockText = p.trackInventory ? '${Fmt.qty(p.stockQuantity)} ${p.unit} in stock' : 'Stock not tracked';
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: t.colorScheme.primary.withValues(alpha: 0.1),
        child: Text(p.name.isEmpty ? '?' : p.name[0].toUpperCase(),
            style: TextStyle(color: t.colorScheme.primary, fontWeight: FontWeight.w700)),
      ),
      title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Row(children: [
        if (p.isLowStock) ...[
          Icon(Icons.warning_amber_rounded, size: 16, color: context.semantic.warning),
          const SizedBox(width: 4),
        ],
        Flexible(
          child: Text(p.isLowStock ? 'Low · $stockText' : stockText,
              overflow: TextOverflow.ellipsis,
              style: p.isLowStock ? TextStyle(color: context.semantic.warning, fontWeight: FontWeight.w600) : null),
        ),
      ]),
      trailing: trailing ??
          Text(p.sellingPrice?.format() ?? '—', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
    );
  }
}
