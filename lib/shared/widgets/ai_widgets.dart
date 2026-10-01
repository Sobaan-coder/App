import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../features/ai_assistant/domain/ai_proposal.dart';

/// Chat bubble for the assistant conversation.
class AIMessageBubble extends StatelessWidget {
  const AIMessageBubble({super.key, required this.text, required this.fromUser, this.child, this.isError = false});
  final String text;
  final bool fromUser;
  final Widget? child;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final bg = fromUser
        ? t.colorScheme.primary
        : isError
            ? t.colorScheme.errorContainer
            : t.colorScheme.surface;
    final fg = fromUser ? t.colorScheme.onPrimary : (isError ? t.colorScheme.onErrorContainer : t.colorScheme.onSurface);
    return Align(
      alignment: fromUser ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Semantics(
          label: '${fromUser ? 'You' : 'Assistant'}: $text',
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 6),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadiusDirectional.only(
                topStart: const Radius.circular(18),
                topEnd: const Radius.circular(18),
                bottomStart: Radius.circular(fromUser ? 18 : 4),
                bottomEnd: Radius.circular(fromUser ? 4 : 18),
              ),
              border: fromUser ? null : Border.all(color: t.dividerTheme.color ?? Colors.transparent),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (text.isNotEmpty) ExcludeSemantics(child: Text(text, style: t.textTheme.bodyLarge?.copyWith(color: fg))),
              if (child != null) ...[if (text.isNotEmpty) const SizedBox(height: Gap.md), child!],
            ]),
          ),
        ),
      ),
    );
  }
}

enum PreviewStatus { pending, committing, committed, cancelled, failed }

/// The structured "Sale detected · 5 × Zinger Burger · Rs 2,500 · Cash" card.
class AITransactionPreview extends StatelessWidget {
  const AITransactionPreview({
    super.key,
    required this.proposal,
    required this.status,
    this.onConfirm,
    this.onCancel,
    this.onUndo,
    this.onShare,
    this.resultText,
    this.animate = true,
  });

  final AiProposal proposal;
  final PreviewStatus status;
  final VoidCallback? onConfirm;
  final VoidCallback? onCancel;
  final VoidCallback? onUndo;
  final VoidCallback? onShare;
  final String? resultText;
  final bool animate;

  String get _confirmLabel {
    final title = (proposal.previewTitle ?? '').toLowerCase();
    if (title.startsWith('sale')) return 'Confirm sale';
    if (title.startsWith('purchase')) return 'Confirm purchase';
    if (title.startsWith('expense')) return 'Confirm expense';
    if (title.contains('product')) return 'Save product';
    return 'Confirm';
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final rows = <Widget>[
      Row(children: [
        Icon(Icons.auto_awesome_rounded, size: 20, color: AppColors.accent),
        const SizedBox(width: 8),
        Expanded(child: Text(proposal.previewTitle ?? proposal.message, style: t.textTheme.titleMedium)),
      ]),
      const SizedBox(height: Gap.md),
      for (final line in proposal.lines)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 96, child: Text(line.label, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant))),
            Expanded(
              child: Text(line.value,
                  style: (line.label == 'Amount' ? t.textTheme.titleLarge : t.textTheme.bodyLarge)
                      ?.copyWith(fontWeight: line.label == 'Amount' ? FontWeight.w800 : FontWeight.w600)),
            ),
          ]),
        ),
      for (final effect in proposal.effects)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(children: [
            Icon(effect.contains('decrease') ? Icons.trending_down_rounded : Icons.info_outline_rounded,
                size: 18, color: t.colorScheme.primary),
            const SizedBox(width: 6),
            Expanded(child: Text(effect, style: t.textTheme.bodyMedium)),
          ]),
        ),
      for (final warning in proposal.warnings)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.warning_amber_rounded, size: 18, color: context.semantic.warning),
            const SizedBox(width: 6),
            Expanded(child: Text(warning, style: t.textTheme.bodyMedium)),
          ]),
        ),
    ];

    return Semantics(
      container: true,
      label: 'Proposed entry',
      child: Container(
        padding: const EdgeInsets.all(Gap.lg),
        decoration: BoxDecoration(
          color: context.semantic.subtle,
          borderRadius: BorderRadius.circular(Gap.radius),
          border: Border.all(color: t.colorScheme.primary.withValues(alpha: 0.25)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          for (var i = 0; i < rows.length; i++) animate ? _Stagger(index: i, child: rows[i]) : rows[i],
          const SizedBox(height: Gap.lg),
          AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: _footer(context)),
        ]),
      ),
    );
  }

  Widget _footer(BuildContext context) {
    final t = Theme.of(context);
    switch (status) {
      case PreviewStatus.pending:
        return Wrap(key: const ValueKey('pending'), spacing: 8, runSpacing: 8, children: [
          FilledButton.icon(onPressed: onConfirm, icon: const Icon(Icons.check_rounded), label: Text(_confirmLabel)),
          OutlinedButton(onPressed: onCancel, child: const Text('Cancel')),
        ]);
      case PreviewStatus.committing:
        return const Row(key: ValueKey('committing'), children: [
          SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4)),
          SizedBox(width: 12),
          Text('Recording…'),
        ]);
      case PreviewStatus.committed:
        return Row(key: const ValueKey('committed'), children: [
          Icon(Icons.check_circle_rounded, color: context.semantic.income),
          const SizedBox(width: 8),
          Expanded(child: Text(resultText ?? 'Recorded', style: t.textTheme.titleSmall?.copyWith(color: context.semantic.income))),
          if (onShare != null) IconButton(tooltip: 'Share invoice', onPressed: onShare, icon: const Icon(Icons.ios_share_rounded)),
          if (onUndo != null) TextButton(onPressed: onUndo, child: const Text('Undo')),
        ]);
      case PreviewStatus.cancelled:
        return Text('Cancelled — nothing was recorded.', key: const ValueKey('cancelled'),
            style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant));
      case PreviewStatus.failed:
        return Wrap(key: const ValueKey('failed'), crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
          Text(resultText ?? 'Not recorded.', style: TextStyle(color: t.colorScheme.error)),
          TextButton(onPressed: onConfirm, child: const Text('Try again')),
        ]);
    }
  }
}

class _Stagger extends StatelessWidget {
  const _Stagger({required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 260 + index * 90),
      curve: Curves.easeOutCubic,
      builder: (context, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, (1 - v) * 8), child: c)),
      child: child,
    );
  }
}
