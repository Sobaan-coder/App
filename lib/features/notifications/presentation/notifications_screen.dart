import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/states.dart';
import '../data/notification_repository.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  static IconData _icon(String type) => switch (type) {
    'low_stock' => Icons.inventory_2_outlined,
    'customer_payment_due' => Icons.call_received_rounded,
    'supplier_payment_due' => Icons.call_made_rounded,
    'daily_summary' => Icons.today_rounded,
    'monthly_report' => Icons.insights_rounded,
    'subscription' => Icons.workspace_premium_outlined,
    _ => Icons.notifications_none_rounded,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: () => markAllRead(ref), child: const Text('Mark all read'))],
      ),
      body: AsyncView<List<AppNotification>>(
        value: ref.watch(notificationsProvider),
        onRetry: () => ref.invalidate(notificationsProvider),
        builder: (list) => list.isEmpty
            ? const EmptyState(
                icon: Icons.notifications_none_rounded,
                title: 'You’re all caught up',
                message: 'Low stock, payment reminders and summaries will show up here.',
              )
            : ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, _) => const Divider(indent: 72),
                itemBuilder: (_, i) {
                  final n = list[i];
                  return ListTile(
                    leading: CircleAvatar(child: Icon(_icon(n.type))),
                    title: Text(n.title, style: TextStyle(fontWeight: n.isRead ? FontWeight.w400 : FontWeight.w700)),
                    subtitle: Text('${n.body}\n${Fmt.relative(n.createdAt)}'),
                    isThreeLine: true,
                    trailing: n.isRead ? null : const Icon(Icons.circle, size: 10, semanticLabel: 'Unread'),
                    onTap: () {
                      final d = n.data;
                      if (d['product_id'] != null) context.push('/products/${d['product_id']}');
                      if (d['customer_id'] != null) context.push('/customers/${d['customer_id']}');
                      if (d['supplier_id'] != null) context.push('/suppliers/${d['supplier_id']}');
                      if (d['route'] != null) context.go(d['route'] as String);
                    },
                  );
                },
              ),
      ),
    );
  }
}
