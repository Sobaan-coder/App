import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/confirm_dialog.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../invoices/data/invoice_service.dart';
import '../data/transaction_repository.dart';
import '../domain/transaction.dart';

class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(transactionDetailProvider(id));
    final business = ref.watch(businessProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction')),
      body: AsyncView<AppTransaction?>(
        value: value,
        onRetry: () => ref.invalidate(transactionDetailProvider(id)),
        builder: (tx) {
          if (tx == null) return const EmptyState(icon: Icons.search_off_rounded, title: 'Transaction not found');
          final t = Theme.of(context);
          final color = tx.type.isMoneyIn ? context.semantic.income : context.semantic.expense;
          Widget info(String label, String? value) => value == null
              ? const SizedBox.shrink()
              : ListTile(
                  dense: true,
                  title: Text(label),
                  trailing: Text(value, style: t.textTheme.bodyLarge),
                );
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: ListView(
                padding: const EdgeInsets.all(Gap.lg),
                children: [
                  if (tx.isDeleted)
                    Card(
                      color: t.colorScheme.errorContainer,
                      child: ListTile(
                        leading: const Icon(Icons.delete_outline_rounded),
                        title: const Text('Deleted'),
                        subtitle: Text(tx.deleteReason ?? 'No reason given'),
                      ),
                    ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(Gap.xl),
                      child: Column(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: color.withValues(alpha: 0.12),
                            child: Icon(tx.type.icon, color: color, size: 28),
                          ),
                          const SizedBox(height: Gap.md),
                          Text(tx.type.label, style: t.textTheme.titleMedium),
                          const SizedBox(height: Gap.sm),
                          Text(
                            '${tx.type.isMoneyIn ? '+' : '−'} ${tx.amount.format()}',
                            style: t.textTheme.headlineMedium?.copyWith(color: color, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: Gap.sm),
                          Text(Fmt.dateTime(tx.transactionDate), style: t.textTheme.bodyMedium),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Gap.md),
                  if (tx.items.isNotEmpty)
                    Card(
                      child: Column(
                        children: [
                          for (final i in tx.items)
                            ListTile(
                              title: Text(i.name),
                              subtitle: Text('${Fmt.qty(i.quantity)} × ${i.unitPrice.format()}'),
                              trailing: Text(i.total.format(), style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                          if (tx.discount != null && !tx.discount!.isZero) info('Discount', '− ${tx.discount!.format()}'),
                        ],
                      ),
                    ),
                  const SizedBox(height: Gap.md),
                  Card(
                    child: Column(
                      children: [
                        info('Description', tx.description),
                        info('Invoice', tx.invoiceNumber),
                        info('Customer', tx.customerName),
                        info('Supplier', tx.supplierName),
                        info('Category', tx.categoryName),
                        info(
                          'Payment',
                          '${tx.paymentMethod.label}${tx.paymentProvider == null ? '' : ' · ${tx.paymentProvider}'}',
                        ),
                        info('Recorded via', Fmt.enumLabel(tx.source)),
                      ],
                    ),
                  ),
                  const SizedBox(height: Gap.lg),
                  if (tx.type == TransactionType.sale && !tx.isDeleted)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: () => InvoiceService.shareText(tx, business),
                          icon: const Icon(Icons.chat_rounded),
                          label: const Text('Share as message'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () =>
                              InvoiceService.sharePdf(tx, business.business, footer: business.settings.invoiceFooter),
                          icon: const Icon(Icons.picture_as_pdf_rounded),
                          label: const Text('PDF invoice'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () =>
                              InvoiceService.printPdf(tx, business.business, footer: business.settings.invoiceFooter),
                          icon: const Icon(Icons.print_rounded),
                          label: const Text('Print'),
                        ),
                      ],
                    ),
                  const SizedBox(height: Gap.lg),
                  if (!tx.isDeleted && business.role.canEditTransactions)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _edit(context, ref, tx),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Edit'),
                        ),
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(foregroundColor: t.colorScheme.error),
                          onPressed: () async {
                            final reason = await showReasonDialog(
                              context,
                              title: 'Delete this transaction?',
                              hint: 'Reason (kept in the audit log)',
                            );
                            if (reason == null) return;
                            try {
                              await ref.read(transactionRepositoryProvider).softDelete(tx.id, reason);
                              if (context.mounted) {
                                showMessage(context, 'Transaction deleted. Stock was restored if needed.');
                                context.pop();
                              }
                            } catch (e) {
                              if (context.mounted) showError(context, e);
                            }
                          },
                          icon: const Icon(Icons.delete_outline_rounded),
                          label: const Text('Delete'),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, AppTransaction tx) async {
    final description = TextEditingController(text: tx.description);
    var method = tx.paymentMethod;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Edit transaction'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: description,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<PaymentMethod>(
                initialValue: method,
                decoration: const InputDecoration(labelText: 'Payment method'),
                items: [for (final m in PaymentMethod.values) DropdownMenuItem(value: m, child: Text(m.label))],
                onChanged: (m) => setState(() => method = m!),
              ),
              const SizedBox(height: 12),
              const Text('Amounts of itemised sales can’t be edited — delete and re-record instead. All edits are audited.'),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(transactionRepositoryProvider).update(tx.id, {
        'description': description.text,
        'payment_method': method.name,
      });
      if (context.mounted) showMessage(context, 'Saved');
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }
}
