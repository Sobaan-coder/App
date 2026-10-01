import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/app_failure.dart';
import '../../core/theme/app_theme.dart';
import 'app_button.dart';

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, this.message});
  final String? message;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Gap.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          if (message != null) ...[const SizedBox(height: Gap.lg), Text(message!)],
        ],
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.actionLabel, this.onAction});
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Gap.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(color: t.colorScheme.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
                child: Icon(icon, size: 36, color: t.colorScheme.primary),
              ),
              const SizedBox(height: Gap.lg),
              Text(title, style: t.textTheme.titleMedium, textAlign: TextAlign.center),
              if (message != null) ...[
                const SizedBox(height: Gap.sm),
                Text(
                  message!,
                  style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: Gap.lg),
                AppButton(label: actionLabel!, onPressed: onAction, icon: Icons.add_rounded),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry, this.compact = false});
  final Object error;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final failure = AppFailure.from(error);
    final t = Theme.of(context);
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          failure.isNetwork ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
          size: compact ? 28 : 40,
          color: t.colorScheme.error,
        ),
        const SizedBox(height: Gap.md),
        Text(failure.message, textAlign: TextAlign.center, style: t.textTheme.bodyMedium),
        if (onRetry != null) ...[
          const SizedBox(height: Gap.md),
          AppButton(label: 'Try again', onPressed: onRetry, variant: AppButtonVariant.secondary, icon: Icons.refresh_rounded),
        ],
      ],
    );
    return Center(
      child: Padding(padding: EdgeInsets.all(compact ? Gap.lg : Gap.xl), child: content),
    );
  }
}

/// Renders an AsyncValue with consistent loading / error states.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.builder, this.onRetry, this.compact = false, this.loading});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;
  final bool compact;
  final Widget? loading;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    skipLoadingOnReload: true,
    data: builder,
    loading: () =>
        loading ??
        (compact
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            : const LoadingState()),
    error: (e, _) => ErrorState(error: e, onRetry: onRetry, compact: compact),
  );
}

/// Shows a friendly snackbar for any error (never raw exceptions).
void showError(BuildContext context, Object error) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(AppFailure.from(error).message)));
}

void showMessage(BuildContext context, String message, {SnackBarAction? action}) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), action: action));
}
