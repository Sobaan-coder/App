import '../../../core/utils/money.dart';

/// All figures are computed by the database (dashboard_summary()).
class DashboardSummary {
  const DashboardSummary({
    required this.currency,
    required this.sales,
    required this.salesCount,
    required this.revenue,
    required this.refunds,
    required this.otherIncome,
    required this.expenses,
    required this.purchases,
    required this.cashIn,
    required this.cashOut,
    required this.netCashFlow,
    required this.receivables,
    required this.payables,
    required this.lowStockCount,
    required this.transactionCount,
    required this.cogsComplete,
    this.cogs,
    this.grossProfit,
    this.netProfit,
    this.profitUnavailableReason,
    this.fromCache = false,
  });

  final String currency;
  final Money sales;
  final int salesCount;
  final Money revenue;
  final Money refunds;
  final Money otherIncome;
  final Money expenses;
  final Money purchases;
  final Money cashIn;
  final Money cashOut;
  final Money netCashFlow;
  final Money receivables;
  final Money payables;
  final int lowStockCount;
  final int transactionCount;
  final bool cogsComplete;
  final Money? cogs;
  final Money? grossProfit;
  final Money? netProfit;
  final String? profitUnavailableReason;
  final bool fromCache;

  factory DashboardSummary.fromJson(Map<String, dynamic> j, {bool fromCache = false}) {
    final c = j['currency'] as String? ?? 'PKR';
    Money m(String k) => Money(readMinor(j[k]) ?? 0, c);
    Money? n(String k) => readMinor(j[k]) == null ? null : Money(readMinor(j[k])!, c);
    return DashboardSummary(
      currency: c,
      sales: m('sales_minor'),
      salesCount: (j['sales_count'] as num?)?.toInt() ?? 0,
      revenue: m('revenue_minor'),
      refunds: m('refunds_minor'),
      otherIncome: m('other_income_minor'),
      expenses: m('expenses_minor'),
      purchases: m('purchases_minor'),
      cashIn: m('cash_in_minor'),
      cashOut: m('cash_out_minor'),
      netCashFlow: m('net_cash_flow_minor'),
      receivables: m('receivables_minor'),
      payables: m('payables_minor'),
      lowStockCount: (j['low_stock_count'] as num?)?.toInt() ?? 0,
      transactionCount: (j['transaction_count'] as num?)?.toInt() ?? 0,
      cogsComplete: j['cogs_complete'] == true,
      cogs: n('cogs_minor'),
      grossProfit: n('gross_profit_minor'),
      netProfit: n('net_profit_minor'),
      profitUnavailableReason: j['profit_unavailable_reason'] as String?,
      fromCache: fromCache,
    );
  }
}

class SeriesPoint {
  const SeriesPoint(this.day, this.sales, this.expenses, this.purchases);
  final DateTime day;
  final Money sales;
  final Money expenses;
  final Money purchases;
}

class CategoryAmount {
  const CategoryAmount(this.category, this.amount, this.count);
  final String category;
  final Money amount;
  final int count;
}

class TopProduct {
  const TopProduct(this.productId, this.name, this.quantity, this.revenue, this.cost);
  final String? productId;
  final String name;
  final double quantity;
  final Money revenue;
  final Money? cost;
}

class LowStockItem {
  const LowStockItem(this.id, this.name, this.stock, this.minimum, this.unit);
  final String id;
  final String name;
  final double stock;
  final double minimum;
  final String unit;
}
