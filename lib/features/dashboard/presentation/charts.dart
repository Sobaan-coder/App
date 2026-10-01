import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/money.dart';
import '../domain/dashboard_models.dart';

/// Sales vs expenses per day. Bars + legend text (not color alone).
class SalesTrendChart extends StatelessWidget {
  const SalesTrendChart({super.key, required this.points});
  final List<SeriesPoint> points;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (points.isEmpty) return const SizedBox(height: 200, child: Center(child: Text('No data for this period')));
    final maxMinor = points.fold<int>(0, (m, p) => [m, p.sales.minor, p.expenses.minor].reduce((a, b) => a > b ? a : b));
    final currency = points.first.sales.currency;
    final every = (points.length / 7).ceil().clamp(1, 1000);
    final total = points.fold<int>(0, (s, p) => s + p.sales.minor);
    return Semantics(
      label: 'Sales trend chart. Total sales ${Money(total, currency).format()} over ${points.length} days.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _legend(context, AppColors.chart[0], 'Sales'),
              const SizedBox(width: 16),
              _legend(context, AppColors.chart[3], 'Expenses'),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: BarChart(
              BarChartData(
                maxY: maxMinor == 0 ? 1 : maxMinor * 1.15,
                gridData: FlGridData(
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(color: t.dividerTheme.color ?? Colors.grey, strokeWidth: 1),
                ),
                borderData: FlBorderData(show: false),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipItem: (group, _, rod, rodIndex) => BarTooltipItem(
                      '${rodIndex == 0 ? 'Sales' : 'Expenses'}\n${Money(rod.toY.round(), currency).format()}',
                      const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(),
                  rightTitles: const AxisTitles(),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 56,
                      getTitlesWidget: (v, meta) => v == meta.max || v == 0
                          ? const SizedBox.shrink()
                          : Text(Money(v.round(), currency).format(compact: true), style: t.textTheme.labelSmall),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (v, _) {
                        final i = v.toInt();
                        if (i < 0 || i >= points.length || i % every != 0) return const SizedBox.shrink();
                        final d = points[i].day;
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(points.length <= 7 ? Fmt.weekday(d) : Fmt.shortDate(d), style: t.textTheme.labelSmall),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < points.length; i++)
                    BarChartGroupData(
                      x: i,
                      barsSpace: 3,
                      barRods: [
                        BarChartRodData(
                          toY: points[i].sales.minor.toDouble(),
                          color: AppColors.chart[0],
                          width: points.length > 20 ? 4 : 10,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        BarChartRodData(
                          toY: points[i].expenses.minor.toDouble(),
                          color: AppColors.chart[3],
                          width: points.length > 20 ? 4 : 10,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _legend(BuildContext context, Color c, String label) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3)),
      ),
      const SizedBox(width: 6),
      Text(label, style: Theme.of(context).textTheme.labelMedium),
    ],
  );
}

/// Horizontal bars with labels and percentages (accessible without color).
class BreakdownBars extends StatelessWidget {
  const BreakdownBars({super.key, required this.items, this.max = 6});
  final List<CategoryAmount> items;
  final int max;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (items.isEmpty) return const Padding(padding: EdgeInsets.all(16), child: Text('No expenses in this period'));
    final total = items.fold<int>(0, (s, i) => s + i.amount.minor);
    final shown = items.take(max).toList();
    return Column(
      children: [
        for (var i = 0; i < shown.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(shown[i].category, style: t.textTheme.bodyMedium)),
                    Text(
                      '${shown[i].amount.format()} · ${total == 0 ? 0 : (shown[i].amount.minor * 100 / total).round()}%',
                      style: t.textTheme.labelLarge,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: total == 0 ? 0 : shown[i].amount.minor / total,
                    minHeight: 8,
                    color: AppColors.chart[i % AppColors.chart.length],
                    backgroundColor: t.dividerTheme.color,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
