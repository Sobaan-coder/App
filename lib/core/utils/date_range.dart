import 'package:intl/intl.dart';

/// Date presets understood by the server's resolve_range() (computed in the
/// business timezone on the server, so every device agrees on "today").
enum DatePreset {
  today('today', 'Today'),
  yesterday('yesterday', 'Yesterday'),
  last7('7d', '7 days'),
  last30('30d', '30 days'),
  thisMonth('this_month', 'This month'),
  lastMonth('last_month', 'Last month'),
  thisYear('this_year', 'This year'),
  custom('custom', 'Custom');

  const DatePreset(this.apiValue, this.label);
  final String apiValue;
  final String label;

  bool get isSingleDay => this == today || this == yesterday;
}

class DateFilter {
  const DateFilter(this.preset, {this.from, this.to});

  const DateFilter.today() : this(DatePreset.today);

  final DatePreset preset;
  final DateTime? from;
  final DateTime? to;

  static final _api = DateFormat('yyyy-MM-dd');

  Map<String, dynamic> toRpcArgs() => {
    'p_preset': preset.apiValue,
    if (preset == DatePreset.custom && from != null) 'p_from': _api.format(from!),
    if (preset == DatePreset.custom && to != null) 'p_to': _api.format(to!),
  };

  String get label {
    if (preset != DatePreset.custom || from == null || to == null) return preset.label;
    final f = DateFormat.MMMd();
    return '${f.format(from!)} – ${f.format(to!)}';
  }

  String get cacheKey => '${preset.apiValue}:${from?.toIso8601String()}:${to?.toIso8601String()}';

  @override
  bool operator ==(Object other) => other is DateFilter && other.preset == preset && other.from == from && other.to == to;

  @override
  int get hashCode => Object.hash(preset, from, to);
}
