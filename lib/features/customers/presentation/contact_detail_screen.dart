import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/services/share_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/confirm_dialog.dart';
import '../../../shared/widgets/metric_card.dart';
import '../../../shared/widgets/states.dart';
import '../../../shared/widgets/transaction_card.dart';
import '../../business/data/business_repository.dart';
import '../../transactions/data/transaction_repository.dart';
import '../../transactions/domain/transaction.dart';
import '../data/contact_repository.dart';
import '../domain/contact.dart';
import 'contacts_screen.dart';

class ContactDetailScreen extends ConsumerWidget {
  const ContactDetailScreen({super.key, required this.kind, required this.id});
  final ContactKind kind;
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final business = ref.watch(businessProvider);
    final query = kind == ContactKind.customer ? TransactionQuery(customerId: id) : TransactionQuery(supplierId: id);
    return AsyncView<Contact>(
      value: ref.watch(contactProvider((kind, id))),
      onRetry: () => ref.invalidate(contactProvider((kind, id))),
      loading: const Scaffold(body: LoadingState()),
      builder: (c) {
        final txs = ref.watch(transactionListProvider(query));
        final owes = (c.outstanding?.minor ?? 0) > 0;
        final payType = kind == ContactKind.customer ? TransactionType.paymentReceived : TransactionType.paymentSent;
        return Scaffold(
          appBar: AppBar(
            title: Text(c.name),
            actions: [
              if (business.role.canRecord)
                IconButton(
                  tooltip: 'Edit',
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () => showContactForm(context, kind, existing: c),
                ),
              if (business.role.canEditCatalogue)
                IconButton(
                  tooltip: 'Archive',
                  icon: const Icon(Icons.archive_outlined),
                  onPressed: () async {
                    if (!await showConfirmDialog(
                      context,
                      title: 'Archive ${c.name}?',
                      message: 'Their history is kept.',
                      confirmLabel: 'Archive',
                    )) {
                      return;
                    }
                    await ref.read(contactRepositoryProvider).archive(kind, c.id);
                    if (context.mounted) context.pop();
                  },
                ),
            ],
          ),
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: ListView(
                padding: const EdgeInsets.all(Gap.lg),
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (c.phone != null) ...[
                        ActionChip(
                          avatar: const Icon(Icons.call_rounded, size: 18),
                          label: Text(c.phone!),
                          onPressed: () => launchUrl(Uri(scheme: 'tel', path: c.phone)),
                        ),
                        if (owes && kind == ContactKind.customer)
                          ActionChip(
                            avatar: const Icon(Icons.chat_rounded, size: 18),
                            label: const Text('Send reminder'),
                            onPressed: () => ShareService.shareText(
                              'Hi ${c.name}, a friendly reminder from ${business.business.name}: your balance is ${c.outstanding!.format()}. Thank you!',
                            ),
                          ),
                      ],
                      if (c.email != null) Chip(avatar: const Icon(Icons.mail_outline_rounded, size: 18), label: Text(c.email!)),
                    ],
                  ),
                  const SizedBox(height: Gap.lg),
                  LayoutBuilder(
                    builder: (context, box) {
                      final w = box.maxWidth >= 600 ? (box.maxWidth - 24) / 3 : (box.maxWidth - 12) / 2;
                      return Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: w,
                            child: MetricCard(
                              label: kind == ContactKind.customer ? 'Outstanding (owes you)' : 'Outstanding (you owe)',
                              value: c.outstanding?.format() ?? '—',
                              icon: Icons.account_balance_wallet_rounded,
                              color: owes ? context.semantic.warning : context.semantic.income,
                            ),
                          ),
                          SizedBox(
                            width: w,
                            child: MetricCard(
                              label: kind == ContactKind.customer ? 'Total spent' : 'Total purchases',
                              value: c.totalPurchases?.format() ?? '—',
                              icon: Icons.shopping_bag_outlined,
                            ),
                          ),
                          SizedBox(
                            width: w,
                            child: MetricCard(
                              label: 'Payments',
                              value: c.totalPayments?.format() ?? '—',
                              icon: Icons.payments_outlined,
                              caption: c.lastTransactionAt == null ? null : 'Last activity ${Fmt.relative(c.lastTransactionAt!)}',
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: Gap.lg),
                  if (business.role.canRecord)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: () => context.push(
                            '/transactions/new?type=${payType.api}&${kind == ContactKind.customer ? 'customer' : 'supplier'}=${c.id}',
                          ),
                          icon: const Icon(Icons.payments_rounded),
                          label: Text(kind == ContactKind.customer ? 'Record payment received' : 'Record payment made'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => context.push(
                            '/transactions/new?type=${kind == ContactKind.customer ? 'sale' : 'purchase'}&${kind == ContactKind.customer ? 'customer' : 'supplier'}=${c.id}',
                          ),
                          icon: const Icon(Icons.add_rounded),
                          label: Text(kind == ContactKind.customer ? 'New sale' : 'New purchase'),
                        ),
                      ],
                    ),
                  if (c.notes != null) ...[
                    const SizedBox(height: Gap.lg),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.sticky_note_2_outlined),
                        title: const Text('Notes'),
                        subtitle: Text(c.notes!),
                      ),
                    ),
                  ],
                  const SizedBox(height: Gap.xl),
                  Text('History', style: Theme.of(context).textTheme.titleMedium),
                  if (txs.items.isEmpty && txs.loading) const LoadingState(),
                  if (txs.items.isEmpty && !txs.loading)
                    const Padding(padding: EdgeInsets.all(16), child: Text('No transactions yet')),
                  for (final tx in txs.items)
                    TransactionCard(transaction: tx, onTap: () => context.push('/transactions/${tx.id}')),
                  if (txs.hasMore && txs.items.isNotEmpty)
                    TextButton(
                      onPressed: () => ref.read(transactionListProvider(query).notifier).loadMore(),
                      child: const Text('Load more'),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
