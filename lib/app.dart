import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routing/app_router.dart';
import 'core/services/app_preferences.dart';
import 'core/services/offline_queue.dart';
import 'core/theme/app_theme.dart';
import 'l10n/gen/app_localizations.dart';

class BusinessPilotApp extends ConsumerWidget {
  const BusinessPilotApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final prefs = ref.watch(appPreferencesProvider);
    ref.watch(offlineQueueProvider); // starts background sync on reconnect
    return MaterialApp.router(
      title: 'BusinessPilot',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: prefs.themeMode,
      locale: prefs.locale,
      // Urdu/Arabic flip the whole UI to RTL automatically (directional widgets throughout).
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    );
  }
}
