import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A user-safe failure. [message] is always friendly; [code] is stable and
/// machine readable; technical details are never shown to users.
class AppFailure implements Exception {
  const AppFailure(this.code, this.message, {this.isNetwork = false, this.cause});

  final String code;
  final String message;
  final bool isNetwork;
  final Object? cause;

  static const generic = AppFailure('unknown', 'Something went wrong. Please try again.');

  /// Maps errors raised by our SQL functions / Edge Functions / network to friendly text.
  factory AppFailure.from(Object error) {
    if (error is AppFailure) return error;
    if (_isNetwork(error)) {
      return AppFailure(
        'network',
        'You appear to be offline. Check your connection and try again.',
        isNetwork: true,
        cause: error,
      );
    }
    final raw = switch (error) {
      PostgrestException e => e.message,
      AuthException e => 'auth:${e.message}',
      FunctionException e => (e.details is Map ? (e.details as Map)['error']?.toString() : null) ?? 'function_error',
      _ => error.toString(),
    };
    return AppFailure(_codeOf(raw), messageFor(raw), cause: error);
  }

  static bool _isNetwork(Object e) {
    if (e is TimeoutException) return true;
    final s = e.toString();
    return s.contains('SocketException') ||
        s.contains('ClientException') ||
        s.contains('Failed host lookup') ||
        s.contains('XMLHttpRequest error') ||
        s.contains('Connection refused') ||
        s.contains('Network is unreachable');
  }

  static String _codeOf(String raw) {
    final m = RegExp(
      r'(not_authenticated|forbidden|not_found(:\w+)?|invalid_input:\w+|invalid_state:\w+|plan_limit:\w+|ambiguous:\w+|rate_limited|feature_disabled|ai_failed)',
    ).firstMatch(raw);
    if (m != null) return m.group(0)!;
    if (raw.startsWith('auth:')) return 'auth';
    return 'unknown';
  }

  static String messageFor(String raw) {
    final code = _codeOf(raw);
    if (raw.startsWith('auth:')) {
      final m = raw.toLowerCase();
      if (m.contains('invalid login')) return 'That email and password don’t match. Please try again.';
      if (m.contains('email not confirmed')) return 'Please confirm your email first — check your inbox.';
      if (m.contains('already registered') || m.contains('already been registered')) {
        return 'An account with this email already exists. Try signing in.';
      }
      if (m.contains('password')) return 'Please choose a stronger password (at least 8 characters).';
      if (m.contains('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
      return 'We couldn’t sign you in. Please try again.';
    }
    return switch (code) {
      'not_authenticated' => 'Your session has expired. Please sign in again.',
      'forbidden' => 'You don’t have permission to do that. Ask the business owner for access.',
      'plan_limit:transactions' => 'You’ve reached this month’s transaction limit on your plan. Upgrade to keep recording.',
      'plan_limit:products' => 'You’ve reached the product limit on your plan. Upgrade to add more.',
      'plan_limit:users' => 'Your plan doesn’t allow more team members. Upgrade to invite more people.',
      'plan_limit:businesses' => 'You’ve reached the maximum number of businesses.',
      'rate_limited' => 'You’re going a bit fast. Please wait a moment and try again.',
      'feature_disabled' => 'This feature isn’t available right now.',
      'invalid_input:customer_required' => 'Please choose a customer for credit sales.',
      'invalid_input:supplier_required' => 'Please choose a supplier for credit purchases.',
      'invalid_input:party_required' => 'Please choose a customer or supplier.',
      'invalid_input:price_missing' => 'Please enter a price for each item.',
      'invalid_input:currency' => 'Amounts must be in your business currency.',
      'invalid_input:amount_locked_items' => 'This amount comes from its items and can’t be edited directly.',
      'invalid_state:deleted' => 'This transaction was deleted.',
      'invalid_state:last_owner' => 'A business needs at least one owner.',
      'ambiguous:customer' => 'More than one customer has that name. Please pick one.',
      'ambiguous:supplier' => 'More than one supplier has that name. Please pick one.',
      'ai_failed' => 'The assistant couldn’t process that. Please try again or add it manually.',
      _ when code.startsWith('not_found') => 'We couldn’t find that. It may have been removed.',
      _ when code.startsWith('invalid_input') => 'Please check the details and try again.',
      _ => 'Something went wrong. Please try again.',
    };
  }

  @override
  String toString() => 'AppFailure($code)';
}
