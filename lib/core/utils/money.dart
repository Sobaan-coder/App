import 'package:equatable/equatable.dart';

/// Money is ALWAYS an integer number of minor units (paisa, cents...) plus an
/// explicit ISO-4217 currency. No floating point is used for amounts.
class Money extends Equatable implements Comparable<Money> {
  const Money(this.minor, this.currency);

  const Money.zero(this.currency) : minor = 0;

  final int minor;
  final String currency;

  static const _zeroDecimal = {'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'};
  static const _threeDecimal = {'BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'};
  static const _symbols = {
    'PKR': 'Rs',
    'INR': '₹',
    'USD': r'$',
    'GBP': '£',
    'EUR': '€',
    'BDT': '৳',
    'NGN': '₦',
    'KES': 'KSh',
    'JPY': '¥',
    'TRY': '₺',
  };

  static int digitsFor(String currency) {
    final c = currency.toUpperCase();
    if (_zeroDecimal.contains(c)) return 0;
    if (_threeDecimal.contains(c)) return 3;
    return 2;
  }

  static String symbolFor(String currency) => _symbols[currency.toUpperCase()] ?? currency.toUpperCase();

  int get digits => digitsFor(currency);
  bool get isNegative => minor < 0;
  bool get isZero => minor == 0;

  Money operator +(Money other) {
    _assertSame(other);
    return Money(minor + other.minor, currency);
  }

  Money operator -(Money other) {
    _assertSame(other);
    return Money(minor - other.minor, currency);
  }

  Money operator -() => Money(-minor, currency);

  /// Multiply by a (possibly fractional) quantity, rounding half away from zero.
  Money times(num quantity) {
    // Work in thousandths to keep 3-decimal quantities exact.
    final q = (quantity * 1000).round();
    final product = BigInt.from(minor) * BigInt.from(q);
    final rounded = (product.abs() + BigInt.from(500)) ~/ BigInt.from(1000);
    return Money(product.isNegative ? -rounded.toInt() : rounded.toInt(), currency);
  }

  void _assertSame(Money other) {
    if (other.currency != currency) {
      throw ArgumentError('Currency mismatch: $currency vs ${other.currency}');
    }
  }

  /// Parse user input such as "1,500", "100.50", "2.5k" into minor units.
  /// Returns null for invalid input or more decimals than the currency allows.
  static Money? tryParse(String input, String currency) {
    var s = input.trim().toLowerCase().replaceAll(',', '').replaceAll(' ', '');
    for (final prefix in ['rs.', 'rs', 'pkr', r'$', '£', '€', '₹']) {
      if (s.startsWith(prefix)) s = s.substring(prefix.length);
    }
    var multiplier = BigInt.one;
    if (s.endsWith('k')) {
      multiplier = BigInt.from(1000);
      s = s.substring(0, s.length - 1);
    }
    final match = RegExp(r'^(\d+)(?:\.(\d+))?$').firstMatch(s);
    if (match == null) return null;
    final whole = match.group(1)!;
    final frac = match.group(2) ?? '';
    final digits = digitsFor(currency);
    final scale = BigInt.from(10).pow(digits);
    final fracScale = BigInt.from(10).pow(frac.length);
    final numerator = (BigInt.parse(whole) * fracScale + BigInt.parse(frac.isEmpty ? '0' : frac)) * multiplier * scale;
    if (numerator % fracScale != BigInt.zero) return null;
    final value = numerator ~/ fracScale;
    if (value > BigInt.from(9007199254740991)) return null;
    return Money(value.toInt(), currency.toUpperCase());
  }

  /// Plain decimal string in major units, e.g. "1500.50" (for CSV & forms).
  String toDecimalString() {
    if (digits == 0) return minor.toString();
    final neg = minor < 0;
    final abs = minor.abs();
    final scale = _pow10(digits);
    final whole = abs ~/ scale;
    final frac = (abs % scale).toString().padLeft(digits, '0');
    return '${neg ? '-' : ''}$whole.$frac';
  }

  /// Display string, e.g. "Rs 2,500", "$1.99", "AED 10".
  String format({bool compact = false, bool showPlus = false}) {
    final neg = minor < 0;
    final abs = minor.abs();
    final scale = _pow10(digits);
    final wholeValue = abs ~/ scale;
    final fracValue = abs % scale;
    String body;
    if (compact && wholeValue >= 1000000) {
      body = '${_trim((wholeValue / 1000000).toStringAsFixed(1))}M';
    } else if (compact && wholeValue >= 100000) {
      body = '${_trim((wholeValue / 1000).toStringAsFixed(0))}K';
    } else {
      body = _group(wholeValue);
      if (digits > 0 && fracValue != 0) body = '$body.${fracValue.toString().padLeft(digits, '0')}';
    }
    final sym = symbolFor(currency);
    final sep = (sym.length > 1) ? ' ' : '';
    final sign = neg ? '-' : (showPlus && minor > 0 ? '+' : '');
    return '$sign$sym$sep$body';
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }

  static String _trim(String s) => s.endsWith('.0') ? s.substring(0, s.length - 2) : s;

  static String _group(int v) {
    final s = v.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }

  @override
  int compareTo(Money other) {
    _assertSame(other);
    return minor.compareTo(other.minor);
  }

  @override
  List<Object?> get props => [minor, currency];

  @override
  String toString() => format();
}

/// Reads an integer minor-unit amount from JSON (PostgREST may return bigint as num or string).
int? readMinor(Object? v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.round();
  return int.tryParse(v.toString());
}

double readQty(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}
