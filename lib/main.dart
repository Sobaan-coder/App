import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/errors/error_reporter.dart';
import 'core/services/local_store.dart';
import 'core/services/supabase_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();

  // Error boundaries: log technical details (sanitized), show friendly UI.
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    ErrorReporter.report(details.exception, details.stack, code: 'flutter_error');
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    ErrorReporter.report(error, stack, code: 'uncaught');
    return true;
  };
  if (kReleaseMode) {
    ErrorWidget.builder = (_) => const Material(
          child: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('Something went wrong. Please try again.', textAlign: TextAlign.center),
            ),
          ),
        );
  }

  final prefs = await SharedPreferences.getInstance();
  await initSupabase();

  runApp(ProviderScope(
    overrides: [keyValueStoreProvider.overrideWithValue(PrefsStore(prefs))],
    // Screens offer explicit "Try again" buttons instead of silent retries.
    retry: (_, _) => null,
    child: const BusinessPilotApp(),
  ));
}
