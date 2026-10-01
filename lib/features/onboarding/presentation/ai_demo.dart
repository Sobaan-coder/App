import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/ai_widgets.dart';
import '../../ai_assistant/domain/ai_proposal.dart';

/// Scripted, clearly-labelled demo of the core interaction (nothing is
/// recorded). Shows the value proposition within seconds of onboarding.
class AiDemo extends StatefulWidget {
  const AiDemo({super.key, required this.currencySymbol, this.onTryForReal});
  final String currencySymbol;
  final VoidCallback? onTryForReal;

  @override
  State<AiDemo> createState() => _AiDemoState();
}

class _AiDemoState extends State<AiDemo> {
  static const _sentence = 'Sold 3 burgers for 1,500 cash';
  String _typed = '';
  int _phase = 0; // 0 typing, 1 thinking, 2 preview, 3 recorded
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _timer?.cancel();
    setState(() {
      _typed = '';
      _phase = 0;
    });
    var i = 0;
    _timer = Timer.periodic(const Duration(milliseconds: 45), (t) {
      if (!mounted) return t.cancel();
      if (i < _sentence.length) {
        setState(() => _typed = _sentence.substring(0, ++i));
      } else {
        t.cancel();
        setState(() => _phase = 1);
        Future.delayed(const Duration(milliseconds: 700), () {
          if (mounted) setState(() => _phase = 2);
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final proposal = AiProposal(
      kind: ProposalKind.action,
      intent: 'record_sale',
      message: 'Sale detected',
      previewTitle: 'Sale detected',
      lines: [
        const PreviewLine('Items', '3 × Burger'),
        PreviewLine('Amount', '${widget.currencySymbol} 1,500'),
        const PreviewLine('Payment', 'Cash'),
      ],
      effects: const ['Inventory will decrease: Burger −3'],
    );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: t.colorScheme.primary, width: 2),
          borderRadius: BorderRadius.circular(Gap.radius),
          color: t.colorScheme.surface,
        ),
        child: Row(children: [
          Icon(Icons.auto_awesome_rounded, color: t.colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(_typed.isEmpty ? 'What happened?' : _typed,
                style: t.textTheme.bodyLarge?.copyWith(
                    color: _typed.isEmpty ? t.colorScheme.onSurfaceVariant : t.colorScheme.onSurface)),
          ),
          if (_phase == 1) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
        ]),
      ),
      const SizedBox(height: Gap.lg),
      AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _phase >= 2
            ? AITransactionPreview(
                key: ValueKey(_phase),
                proposal: proposal,
                status: _phase == 3 ? PreviewStatus.committed : PreviewStatus.pending,
                resultText: 'Sale recorded (demo — nothing was saved)',
                onConfirm: () => setState(() => _phase = 3),
                onCancel: _start,
              )
            : const SizedBox(height: 180),
      ),
      const SizedBox(height: Gap.md),
      Wrap(alignment: WrapAlignment.center, spacing: 8, children: [
        TextButton.icon(onPressed: _start, icon: const Icon(Icons.replay_rounded), label: const Text('Replay')),
        if (widget.onTryForReal != null)
          TextButton.icon(onPressed: widget.onTryForReal, icon: const Icon(Icons.bolt_rounded), label: const Text('Try it for real')),
      ]),
    ]);
  }
}
