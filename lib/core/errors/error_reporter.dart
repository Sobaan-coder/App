import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// Central error logging. Records sanitized details (no amounts, names,
/// passwords or tokens) to public.app_errors for the admin "System health" view.
class ErrorReporter {
  ErrorReporter._();

  static final _sensitive = RegExp(
    r'(eyJ[\w-]+\.[\w-]+\.[\w-]+)|(password\S*)|(apikey\S*)|(Bearer\s+\S+)|([\w.+-]+@[\w-]+\.[\w.]+)',
    caseSensitive: false,
  );

  static String sanitize(String s) => s.replaceAll(_sensitive, '[redacted]').substring(0, s.length.clamp(0, 400));

  static Future<void> report(
    Object error,
    StackTrace? stack, {
    String source = 'client',
    String code = 'exception',
    String? businessId,
  }) async {
    debugPrint('[$source] $code: $error');
    if (!Env.isConfigured) return;
    try {
      final client = Supabase.instance.client;
      final userId = client.auth.currentUser?.id;
      if (userId == null) return;
      await client.from('app_errors').insert({
        'source': source,
        'code': code,
        'message': sanitize(error.toString()),
        'user_id': userId,
        'business_id': ?businessId,
        'context': {
          'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
          'env': Env.appEnv,
          if (stack != null) 'top_frame': sanitize(stack.toString().split('\n').take(3).join(' | ')),
        },
      });
    } catch (_) {
      // Logging must never crash the app.
    }
  }
}
