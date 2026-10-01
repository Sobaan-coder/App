import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/period_selector.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../customers/data/contact_repository.dart';
import '../../customers/domain/contact.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../dashboard/domain/dashboard_models.dart';
import '../../dashboard/presentation/charts.dart';
import '../../dashboard/presentation/profit_methodology.dart';
import '../../products/data/product_repository.dart';
import '../data/report_exporter.dart';

enum ReportKind {
  sales('Sales', Icons.trending_up_rounded),
  expenses('Expenses', Icons.trending_down_rounded),
  profit('Profit', Icons.account_balance_wallet_rounded),
  cashflow('Cash flow', Icons.swap_vert_rounded),
  products('Product performance', Icons.star_outline_rounded),
  inventory('Inventory', Icons.inventory_2_outlined),
  customers('Customers', Icons.people_outline_rounded),
  suppliers('Suppliers', Icons.local_shipping_outlined);

  const ReportKind(this.label, this.icon);
  final String label;
  final IconData icon;
}

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});
  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  ReportKind _kind = ReportKind.sales;
  DateFilter _filter = const DateFilter(DatePreset.thisMonth);
  bool _exporting = false;

  Future<void> _export(bool pdf) async {
    setState(() => _exporting = true);
    final exporter = ReportExporter(ref);
    try {
      final table = await _tableFor(exporter);
      final name = '${_kind.name}-${_filter.preset.apiValue}';
      pdf ? await exporter.sharePdf(table, name) : await exporter.shareCsv(table, name);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<ReportTable> _tableFor(ReportExporter ex) async {
    final b = ref.read(businessProvider);
    switch (_kind) {
      case ReportKind.products:
        final rows = await ref.read(topProductsProvider(_filter).future);
        return ReportTable(title: 'Product performance', subtitle: _filter.label,
            headers: const ['Product', 'Quantity sold', 'Revenue', 'Cost', 'Gross profit'],
            rows: [
              for (final r in rows)
                [r.name, Fmt.qty(r.quantity), r.revenue.toDecimalString(), r.cost?.toDecimalString() ?? 'unknown',
                  r.cost == null ? 'unknown' : (r.revenue - r.cost!).toDecimalString()],
            ]);
      case ReportKind.inventory:
        final products = await ref.read(productsProvider.future);
        return ReportTable(title: 'Inventory', subtitle: 'Current stock',
            headers: const ['Product', 'SKU', 'Stock', 'Unit', 'Minimum', 'Cost price', 'Stock value'],
            rows: [
              for (final p in products.where((p) => p.trackInventory))
                [p.name, p.sku ?? '', Fmt.qty(p.stockQuantity), p.unit, Fmt.qty(p.minimumStock), p.costPrice?.toDecimalString() ?? '',
                  p.costPrice == null ? '' : p.costPrice!.times(p.stockQuantity).toDecimalString()],
            ]);
      case ReportKind.customers:
      case ReportKind.suppliers:
        final kind = _kind == ReportKind.customers ? ContactKind.customer : ContactKind.supplier;
        final list = await ref.read(contactsProvider(kind).future);
        return ReportTable(title: kind.pluralLabel, subtitle: 'Balances as of today',
            headers: const ['Name', 'Phone', 'Total purchases', 'Payments', 'Outstanding', 'Last activity'],
            rows: [
              for (final c in list)
                [c.name, c.phone ?? '', c.totalPurchases?.toDecimalString() ?? '', c.totalPayments?.toDecimalString() ?? '',
                  c.outstanding?.toDecimalString() ?? '', c.lastTransactionAt == null ? '' : Fmt.date(c.lastTransactionAt!)],
            ]);
      default:
        final t = await ex.ledger(_filter);
        return ReportTable(title: '${_kind.label} report', subtitle: '${t.subtitle} · ${b.business.name}', headers: t.headers, rows: t.rows);
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = Breakpoints.isCompact(context);
    final usesPeriod = _kind != ReportKind.inventory && _kind != ReportKind.customers && _kind != ReportKind.suppliers;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.navReports), actions: [
        PopupMenuButton<bool>(
          tooltip: 'Export',
          enabled: !_exporting,
          icon: _exporting
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.ios_share_rounded),
          onSelected: _export,
          itemBuilder: (_) => const [
            PopupMenuItem(value: false, child: ListTile(leading: Icon(Icons.table_chart_outlined), title: Text('Export CSV'))),
            PopupMenuItem(value: true, child: ListTile(leading: Icon(Icons.picture_as_pdf_outlined), title: Text('Export PDF'))),
          ],
        ),
        const ShellActions(),
      ]),
      body: ListView(padding: EdgeInsets.all(compact ? Gap.lg : Gap.xl), children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final k in ReportKind.values)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: ChoiceChip(avatar: Icon(k.icon, size: 18), label: Text(k.label), selected: _kind == k,
                    onSelected: (_) => setState(() => _kind = k)),
              ),
          ]),
        ),
        const SizedBox(height: Gap.md),
        if (usesPeriod) PeriodSelector(value: _filter, onChanged: (f) => setState(() => _filter = f)),
        const SizedBox(height: Gap.lg),
        _body(),
      ]),
    );
  }

  Widget _body() {
    switch (_kind) {
      case ReportKind.sales:
        return _SummaryReport(filter: _filter, builder: (s) => [
              _kv('Sales', s.sales.format()), _kv('Orders', '${s.salesCount}'),
              _kv('Average order', s.salesCount == 0 ? '—' : Money(s.sales.minor ~/ s.salesCount, s.currency).format()),
              _kv('Refunds', s.refunds.format()),
            ], chart: true);
      case ReportKind.expenses:
        return Column(children: [
          _SummaryReport(filter: _filter, builder: (s) => [_kv('Operating expenses', s.expenses.format()), _kv('Stock purchases', s.purchases.format())]),
          const SizedBox(height: Gap.lg),
          Card(child: Padding(padding: const EdgeInsets.all(Gap.lg), child: AsyncView(
            value: ref.watch(expenseBreakdownProvider(_filter)), compact: true, builder: (i) => BreakdownBars(items: i, max: 20)))),
        ]);
      case ReportKind.profit:
        return _SummaryReport(filter: _filter, builder: (s) => [
              _kv('Revenue', s.revenue.format()),
              _kv('Cost of goods sold', s.cogs?.format() ?? 'Unknown'),
              _kv('Gross profit', s.grossProfit?.format() ?? 'Unavailable'),
              _kv('Operating expenses', s.expenses.format()),
              _kv('Other income', s.otherIncome.format()),
              _kv('Estimated net profit', s.netProfit?.format() ?? 'Unavailable', bold: true),
              if (s.netProfit == null)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text(context.l10n.dashProfitUnavailable,
                    style: TextStyle(color: context.semantic.warning, fontWeight: FontWeight.w600))),
              Align(alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(onPressed: () => showProfitMethodology(context, s), icon: const Icon(Icons.info_outline_rounded),
                      label: const Text('How this is calculated'))),
            ]);
      case ReportKind.cashflow:
        return _SummaryReport(filter: _filter, builder: (s) => [
              _kv('Money in (paid sales, income, payments received)', s.cashIn.format()),
              _kv('Money out (paid purchases, expenses, payments)', s.cashOut.format()),
              _kv('Net cash flow', s.netCashFlow.format(), bold: true),
              _kv('Customers owe you', s.receivables.format()),
              _kv('You owe suppliers', s.payables.format()),
            ], chart: true);
      case ReportKind.products:
        return Card(child: AsyncView(
          value: ref.watch(topProductsProvider(_filter)), compact: true,
          builder: (rows) => rows.isEmpty ? const Padding(padding: EdgeInsets.all(16), child: Text('No itemised sales in this period.'))
              : Column(children: [
                  for (final r in rows)
                    ListTile(
                      title: Text(r.name),
                      subtitle: Text('${Fmt.qty(r.quantity)} sold${r.cost == null ? '' : ' · gross profit ${(r.revenue - r.cost!).format()}'}'),
                      trailing: Text(r.revenue.format(), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ]),
        ));
      case ReportKind.inventory:
        return Card(child: AsyncView(
          value: ref.watch(productsProvider), compact: true,
          builder: (products) {
            final tracked = products.where((p) => p.trackInventory).toList();
            final valued = tracked.where((p) => p.costPrice != null);
            final value = valued.fold<int>(0, (s, p) => s + p.costPrice!.times(p.stockQuantity).minor);
            return Column(children: [
              ListTile(title: const Text('Stock value (at cost)'),
                  subtitle: Text('${valued.length} of ${tracked.length} products have a cost price'),
                  trailing: Text(Money(value, ref.read(businessProvider).currency).format(), style: const TextStyle(fontWeight: FontWeight.w700))),
              const Divider(),
              for (final p in tracked)
                ListTile(dense: true, title: Text(p.name),
                    leading: p.isLowStock ? Icon(Icons.warning_amber_rounded, color: context.semantic.warning) : const Icon(Icons.check_circle_outline),
                    trailing: Text('${Fmt.qty(p.stockQuantity)} ${p.unit}')),
            ]);
          },
        ));
      case ReportKind.customers:
      case ReportKind.suppliers:
        final kind = _kind == ReportKind.customers ? ContactKind.customer : ContactKind.supplier;
        return Card(child: AsyncView(
          value: ref.watch(contactsProvider(kind)), compact: true,
          builder: (list) {
            final sorted = [...list]..sort((a, b) => (b.outstanding?.minor ?? 0).compareTo(a.outstanding?.minor ?? 0));
            return Column(children: [
              for (final c in sorted)
                ListTile(title: Text(c.name), subtitle: Text('Purchases ${c.totalPurchases?.format()} · Payments ${c.totalPayments?.format()}'),
                    trailing: Text(c.outstanding?.format() ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
              if (sorted.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No records yet')),
            ]);
          },
        ));
    }
  }

  Widget _kv(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          Expanded(child: Text(k, style: bold ? Theme.of(context).textTheme.titleMedium : null)),
          Text(v, style: (bold ? Theme.of(context).textTheme.titleLarge : Theme.of(context).textTheme.titleSmall)),
        ]),
      );
}

class _SummaryReport extends ConsumerWidget {
  const _SummaryReport({required this.filter, required this.builder, this.chart = false});
  final DateFilter filter;
  final List<Widget> Function(DashboardSummary) builder;
  final bool chart;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(Gap.lg),
            child: AsyncView(
              value: ref.watch(summaryProvider(filter)),
              compact: true,
              onRetry: () => ref.invalidate(summaryProvider(filter)),
              builder: (s) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: builder(s)),
            ),
          ),
        ),
        if (chart) ...[
          const SizedBox(height: Gap.lg),
          Card(child: Padding(padding: const EdgeInsets.all(Gap.lg), child: AsyncView(
            value: ref.watch(seriesProvider(filter)), compact: true, builder: (p) => SalesTrendChart(points: p)))),
        ],
      ]);
}
