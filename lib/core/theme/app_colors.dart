import 'package:flutter/material.dart';

/// Brand palette. "Pilot teal" conveys calm & trust; amber is the accent for
/// the AI moments. Semantic colors are always paired with icons/text so
/// meaning is never conveyed by color alone.
class AppColors {
  const AppColors._();

  static const brand = Color(0xFF0E7C66);
  static const brandDark = Color(0xFF0A5C4C);
  static const brandLight = Color(0xFF5BC2A7);
  static const accent = Color(0xFFF2A93B);
  static const ink = Color(0xFF0F172A);

  static const success = Color(0xFF15803D);
  static const successDark = Color(0xFF4ADE80);
  static const danger = Color(0xFFB42318);
  static const dangerDark = Color(0xFFF97066);
  static const warning = Color(0xFFB54708);
  static const warningDark = Color(0xFFFDB022);

  static const chart = [Color(0xFF0E7C66), Color(0xFFF2A93B), Color(0xFF3B82F6), Color(0xFFE5484D), Color(0xFF8B5CF6), Color(0xFF64748B)];
}

/// Semantic colors resolved for the current brightness.
@immutable
class SemanticColors extends ThemeExtension<SemanticColors> {
  const SemanticColors({required this.income, required this.expense, required this.warning, required this.subtle});

  final Color income;
  final Color expense;
  final Color warning;
  final Color subtle;

  static const light = SemanticColors(
      income: AppColors.success, expense: AppColors.danger, warning: AppColors.warning, subtle: Color(0xFFF1F5F4));
  static const dark = SemanticColors(
      income: AppColors.successDark, expense: AppColors.dangerDark, warning: AppColors.warningDark, subtle: Color(0xFF1B2523));

  @override
  SemanticColors copyWith({Color? income, Color? expense, Color? warning, Color? subtle}) => SemanticColors(
      income: income ?? this.income, expense: expense ?? this.expense, warning: warning ?? this.warning, subtle: subtle ?? this.subtle);

  @override
  SemanticColors lerp(ThemeExtension<SemanticColors>? other, double t) {
    if (other is! SemanticColors) return this;
    return SemanticColors(
      income: Color.lerp(income, other.income, t)!,
      expense: Color.lerp(expense, other.expense, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      subtle: Color.lerp(subtle, other.subtle, t)!,
    );
  }
}

extension SemanticColorsX on BuildContext {
  SemanticColors get semantic => Theme.of(this).extension<SemanticColors>()!;
}
