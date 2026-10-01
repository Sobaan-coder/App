import 'package:flutter/material.dart';

import '../domain/dashboard_models.dart';

/// Transparent explanation of how profit is estimated.
Future<void> showProfitMethodology(BuildContext context, DashboardSummary? s) {
  final t = Theme.of(context);
  Widget row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(child: Text(label, style: bold ? t.textTheme.titleSmall : null)),
          Text(value, style: bold ? t.textTheme.titleSmall : null),
        ]),
      );
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('How profit is estimated'),
      content: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          const Text('Revenue − cost of goods sold − operating expenses (+ other income).'),
          const SizedBox(height: 12),
          if (s != null) ...[
            row('Revenue (sales − refunds)', s.revenue.format()),
            row('Cost of goods sold', s.cogs?.format() ?? 'Unknown'),
            row('Operating expenses', '− ${s.expenses.format()}'),
            if (!s.otherIncome.isZero) row('Other income', '+ ${s.otherIncome.format()}'),
            const Divider(),
            row('Estimated net profit', s.netProfit?.format() ?? 'Unavailable', bold: true),
            const SizedBox(height: 12),
          ],
          const Text('• Cost of goods sold uses each product’s cost price at the time of the sale.'),
          const Text('• Stock purchases are not expenses — they become cost when the stock is sold.'),
          const Text('• If any sale has no cost data, we don’t estimate profit rather than guess.'),
          const Text('• This is an estimate from the data you’ve entered, not an accounting statement.'),
          if (s != null && !s.cogsComplete) ...[
            const SizedBox(height: 12),
            Text('Profit estimate unavailable because product cost data is incomplete. '
                'Add cost prices to your products and record sales with items.',
                style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ]),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Got it'))],
    ),
  );
}
