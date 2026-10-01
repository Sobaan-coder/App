import 'package:flutter/material.dart';

import '../../core/utils/date_range.dart';

/// Date filter chips: Today · Yesterday · 7 days · 30 days · This month · Last month · Custom.
class PeriodSelector extends StatelessWidget {
  const PeriodSelector({super.key, required this.value, required this.onChanged, this.presets});
  final DateFilter value;
  final ValueChanged<DateFilter> onChanged;
  final List<DatePreset>? presets;

  @override
  Widget build(BuildContext context) {
    final items =
        presets ??
        const [
          DatePreset.today,
          DatePreset.yesterday,
          DatePreset.last7,
          DatePreset.last30,
          DatePreset.thisMonth,
          DatePreset.lastMonth,
          DatePreset.custom,
        ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final p in items)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: ChoiceChip(
                label: Text(p == DatePreset.custom && value.preset == DatePreset.custom ? value.label : p.label),
                selected: value.preset == p,
                onSelected: (_) async {
                  if (p != DatePreset.custom) return onChanged(DateFilter(p));
                  final now = DateTime.now();
                  final range = await showDateRangePicker(
                    context: context,
                    firstDate: DateTime(now.year - 5),
                    lastDate: now,
                    initialDateRange: value.from != null && value.to != null
                        ? DateTimeRange(start: value.from!, end: value.to!)
                        : DateTimeRange(start: now.subtract(const Duration(days: 6)), end: now),
                  );
                  if (range != null) onChanged(DateFilter(DatePreset.custom, from: range.start, to: range.end));
                },
              ),
            ),
        ],
      ),
    );
  }
}
