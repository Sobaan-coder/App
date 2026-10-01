import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Spacing & radius tokens.
class Gap {
  const Gap._();
  static const xs = 4.0, sm = 8.0, md = 12.0, lg = 16.0, xl = 24.0, xxl = 32.0;
  static const radius = 16.0, radiusSm = 10.0, radiusLg = 24.0;
  static const minTouch = 48.0;
}

class AppTheme {
  const AppTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final isDark = b == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      brightness: b,
      primary: isDark ? AppColors.brandLight : AppColors.brand,
      secondary: AppColors.accent,
      surface: isDark ? const Color(0xFF111816) : const Color(0xFFFFFFFF),
    );
    final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: b);
    final text = base.textTheme.apply(
      bodyColor: isDark ? const Color(0xFFE7EFEC) : AppColors.ink,
      displayColor: isDark ? const Color(0xFFF2F7F5) : AppColors.ink,
    );
    final outline = isDark ? const Color(0xFF2A3633) : const Color(0xFFE3E9E7);

    return base.copyWith(
      scaffoldBackgroundColor: isDark ? const Color(0xFF0B1110) : const Color(0xFFF6F8F7),
      textTheme: text.copyWith(
        headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5),
        headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
        titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        bodyLarge: text.bodyLarge?.copyWith(fontSize: 16, height: 1.45),
        bodyMedium: text.bodyMedium?.copyWith(fontSize: 15, height: 1.4),
        labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
      ),
      extensions: [isDark ? SemanticColors.dark : SemanticColors.light],
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radius), side: BorderSide(color: outline)),
      ),
      dividerTheme: DividerThemeData(color: outline, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF16201E) : const Color(0xFFF8FAF9),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(Gap.radiusSm), borderSide: BorderSide(color: outline)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Gap.radiusSm), borderSide: BorderSide(color: outline)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(Gap.radiusSm), borderSide: BorderSide(color: scheme.primary, width: 2)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, Gap.minTouch + 4),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, Gap.minTouch + 4),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          side: BorderSide(color: outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(minimumSize: const Size(48, Gap.minTouch)),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999), side: BorderSide(color: outline)),
        side: BorderSide(color: outline),
        labelStyle: text.labelLarge?.copyWith(fontSize: 14),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primary.withValues(alpha: 0.14),
        labelTextStyle: WidgetStatePropertyAll(text.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
      ),
      listTileTheme: const ListTileThemeData(minVerticalPadding: 12),
      visualDensity: VisualDensity.standard,
    );
  }
}
