import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'local_store.dart';

/// Device-level preferences: theme mode and language.
class AppPreferences {
  const AppPreferences({this.themeMode = ThemeMode.system, this.locale});
  final ThemeMode themeMode;
  final Locale? locale;

  AppPreferences copyWith({ThemeMode? themeMode, Locale? locale, bool clearLocale = false}) =>
      AppPreferences(themeMode: themeMode ?? this.themeMode, locale: clearLocale ? null : (locale ?? this.locale));
}

class AppPreferencesController extends Notifier<AppPreferences> {
  static const _themeKey = 'bp_theme_mode';
  static const _localeKey = 'bp_locale';

  @override
  AppPreferences build() {
    final store = ref.watch(keyValueStoreProvider);
    final theme = ThemeMode.values.where((m) => m.name == store.getString(_themeKey)).firstOrNull ?? ThemeMode.system;
    final code = store.getString(_localeKey);
    return AppPreferences(themeMode: theme, locale: code == null ? null : Locale(code));
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = state.copyWith(themeMode: mode);
    await ref.read(keyValueStoreProvider).setString(_themeKey, mode.name);
  }

  Future<void> setLocale(Locale? locale) async {
    state = state.copyWith(locale: locale, clearLocale: locale == null);
    final store = ref.read(keyValueStoreProvider);
    if (locale == null) {
      await store.remove(_localeKey);
    } else {
      await store.setString(_localeKey, locale.languageCode);
    }
  }
}

final appPreferencesProvider = NotifierProvider<AppPreferencesController, AppPreferences>(AppPreferencesController.new);
