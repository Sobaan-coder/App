import 'package:flutter/material.dart';

enum AppButtonVariant { primary, secondary, text, danger }

/// Standard button with built-in loading state and generous touch target.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = AppButtonVariant.primary,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final AppButtonVariant variant;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final child = loading
        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    final action = loading ? null : onPressed;
    final button = switch (variant) {
      AppButtonVariant.primary => FilledButton(onPressed: action, child: child),
      AppButtonVariant.secondary => OutlinedButton(onPressed: action, child: child),
      AppButtonVariant.text => TextButton(onPressed: action, child: child),
      AppButtonVariant.danger => FilledButton(
        style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
        onPressed: action,
        child: child,
      ),
    };
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      enabled: action != null,
      child: expand ? SizedBox(width: double.infinity, child: button) : button,
    );
  }
}
