import 'package:intl/intl.dart';

class Fmt {
  const Fmt._();

  /// Timestamps are stored in UTC; display them in local time.
  static String dateTime(DateTime utc) => DateFormat('d MMM, h:mm a').format(utc.toLocal());
  static String date(DateTime utc) => DateFormat('d MMM yyyy').format(utc.toLocal());
  static String shortDate(DateTime d) => DateFormat('d MMM').format(d);
  static String weekday(DateTime d) => DateFormat('EEE').format(d);

  static String relative(DateTime utc) {
    final now = DateTime.now();
    final local = utc.toLocal();
    final diff = now.difference(local);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24 && now.day == local.day) return DateFormat('h:mm a').format(local);
    if (diff.inDays < 2 && now.day != local.day) return 'Yesterday ${DateFormat('h:mm a').format(local)}';
    return DateFormat('d MMM, h:mm a').format(local);
  }

  static String qty(num q) {
    if (q == q.roundToDouble()) return q.toInt().toString();
    return q.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }

  static String titleCase(String s) =>
      s.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).map((w) => w[0].toUpperCase() + w.substring(1)).join(' ');

  static String enumLabel(String s) => titleCase(s.replaceAll('_', ' '));
}
