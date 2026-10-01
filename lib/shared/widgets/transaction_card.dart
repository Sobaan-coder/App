import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../features/transactions/domain/transaction.dart';

class TransactionCard extends StatelessWidget {
  const TransactionCard({super.key, required this.transaction, this.onTap, this.dense = false});
  final AppTransaction transaction;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final tx = transaction;
    final moneyIn = tx.type.isMoneyIn;
    final color = moneyIn ? context.semantic.income : context.semantic.expense;
    final subtitle = [
      tx.type.label,
      if (tx.counterparty != null) tx.counterparty!,
      tx.paymentMethod.label,
      Fmt.relative(tx.transactionDate),
    ].join(' · ');
    return Semantics(
      button: onTap != null,
      label: '${tx.type.label}, ${tx.title}, ${moneyIn ? 'money in' : 'money out'} ${tx.amount.format()}, $subtitle'
          '${tx.pending ? ', waiting to sync' : ''}',
      excludeSemantics: true,
      child: ListTile(
        onTap: onTap,
        contentPadding: EdgeInsets.symmetric(horizontal: dense ? 4 : 16, vertical: dense ? 0 : 4),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(tx.type.icon, color: color, size: 22),
        ),
        title: Text(tx.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.textTheme.titleSmall),
        subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          // Sign + color + icon so meaning never relies on color alone.
          Text('${moneyIn ? '+' : '−'} ${tx.amount.format()}',
              style: t.textTheme.titleSmall?.copyWith(color: color, fontWeight: FontWeight.w700)),
          if (tx.pending)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.cloud_upload_outlined, size: 14, color: t.colorScheme.onSurfaceVariant),
              const SizedBox(width: 4),
              Text('Pending', style: t.textTheme.labelSmall),
            ])
          else if (tx.invoiceNumber != null)
            Text(tx.invoiceNumber!, style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
        ]),
      ),
    );
  }
}
