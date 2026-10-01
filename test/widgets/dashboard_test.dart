import 'package:businesspilot/core/utils/money.dart';
import 'package:businesspilot/features/dashboard/data/dashboard_repository.dart';
import 'package:businesspilot/features/dashboard/domain/dashboard_models.dart';
import 'package:businesspilot/features/dashboard/presentation/dashboard_screen.dart';
import 'package:businesspilot/features/transactions/data/transaction_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

DashboardSummary summary({int? profit}) => DashboardSummary.fromJson({
  'currency': 'PKR',
  'sales_minor': 250000,
  'sales_count': 1,
  'revenue_minor': 250000,
  'refunds_minor': 0,
  'other_income_minor': 0,
  'expenses_minor': 450000,
  'purchases_minor': 0,
  'cash_in_minor': 250000,
  'cash_out_minor': 450000,
  'net_cash_flow_minor': -200000,
  'receivables_minor': 300000,
  'payables_minor': 0,
  'low_stock_count': 2,
  'transaction_count': 2,
  'cogs_complete': profit != null,
  'cogs_minor': profit == null ? null : 150000,
  'net_profit_minor': profit,
  'profit_unavailable_reason': profit == null ? 'incomplete_cost_data' : null,
});

void main() {
  Future<void> pump(WidgetTester tester, DashboardSummary s) => pumpApp(
    tester,
    const DashboardScreen(),
    size: const Size(1300, 1600),
    overrides: [
      summaryProvider.overrideWith((ref, _) async => s),
      seriesProvider.overrideWith(
        (ref, _) async => [
          SeriesPoint(DateTime(2026, 10, 1), const Money(250000, 'PKR'), const Money(450000, 'PKR'), const Money(0, 'PKR')),
        ],
      ),
      expenseBreakdownProvider.overrideWith((ref, _) async => [const CategoryAmount('Electricity', Money(450000, 'PKR'), 1)]),
      topProductsProvider.overrideWith(
        (ref, _) async => [const TopProduct('p1', 'Zinger Burger', 5, Money(250000, 'PKR'), null)],
      ),
      lowStockProvider.overrideWith((ref) async => const []),
      recentTransactionsProvider.overrideWith((ref) async => const []),
    ],
  );

  testWidgets('shows server-computed figures', (tester) async {
    await pump(tester, summary(profit: -300000));
    expect(find.text('Rs 2,500'), findsWidgets); // sales
    expect(find.text('Rs 4,500'), findsWidgets); // expenses
    expect(find.text('-Rs 3,000'), findsOneWidget); // profit (loss)
    expect(find.text('Rs 3,000'), findsWidgets); // receivables
    expect(find.text('What happened today?'), findsOneWidget);
    expect(find.text('Zinger Burger'), findsOneWidget);
  });

  testWidgets('never fabricates profit when cost data is missing', (tester) async {
    await pump(tester, summary());
    expect(find.text('Unavailable'), findsOneWidget);
    expect(find.textContaining('Cost data incomplete'), findsOneWidget);
  });
}
