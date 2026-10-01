import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/ai_widgets.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../../invoices/data/invoice_service.dart';
import '../../transactions/data/transaction_repository.dart';
import '../data/ai_repository.dart';
import '../domain/ai_proposal.dart';
import 'ai_controller.dart';

class AiAssistantScreen extends ConsumerStatefulWidget {
  const AiAssistantScreen({super.key, this.initialText});
  final String? initialText;

  @override
  ConsumerState<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends ConsumerState<AiAssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    final q = widget.initialText;
    if (q != null && q.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _send(q));
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _send([String? text]) async {
    final t = text ?? _input.text;
    if (t.trim().isEmpty) return;
    _input.clear();
    final future = ref.read(aiChatProvider.notifier).send(t);
    _scrollToEnd();
    await future;
    _scrollToEnd();
  }

  void _scrollToEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(_scroll.position.maxScrollExtent + 200,
              duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
        }
      });

  Future<void> _scanReceipt() async {
    final business = ref.read(businessProvider);
    final picked = await FilePicker.platform.pickFiles(type: FileType.image, withData: true);
    final file = picked?.files.singleOrNull;
    if (file?.bytes == null) return;
    final ext = (file!.extension ?? 'jpg').toLowerCase();
    await ref.read(aiChatProvider.notifier).sendReceipt(
        () => ref.read(aiRepositoryProvider).processReceipt(business.id, file.bytes!, ext == 'png' ? 'png' : 'jpg'));
    _scrollToEnd();
  }

  Future<void> _share(ChatEntry e) async {
    try {
      final tx = await ref.read(transactionRepositoryProvider).get(e.transactionId!);
      if (tx != null) await InvoiceService.shareText(tx, ref.read(businessProvider));
    } catch (err) {
      if (mounted) showError(context, err);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(aiChatProvider);
    final business = ref.watch(businessProvider);
    final controller = ref.read(aiChatProvider.notifier);
    final t = Theme.of(context);
    final l = context.l10n;

    if (!business.flags.aiEnabled) {
      return Scaffold(
        appBar: AppBar(title: Text(l.navAiAssistant)),
        body: const EmptyState(icon: Icons.auto_awesome_outlined, title: 'The assistant is turned off',
            message: 'You can still record everything using the Record button.'),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l.navAiAssistant),
        actions: [
          if (state.entries.isNotEmpty)
            IconButton(tooltip: 'New conversation', onPressed: controller.clear, icon: const Icon(Icons.refresh_rounded)),
          const ShellActions(),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: state.entries.isEmpty
                  ? _Welcome(onPick: _send)
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.xl),
                      itemCount: state.entries.length + (state.thinking ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i == state.entries.length) {
                          return Semantics(
                            liveRegion: true,
                            child: AIMessageBubble(
                              text: l.aiThinking,
                              fromUser: false,
                              child: const LinearProgressIndicator(minHeight: 3),
                            ),
                          );
                        }
                        final e = state.entries[i];
                        return _EntryView(
                          entry: e,
                          canRecord: business.role.canRecord,
                          onConfirm: () => controller.confirm(e.id),
                          onCancel: () => controller.cancel(e.id),
                          onUndo: () => controller.undo(e.id),
                          onShare: () => _share(e),
                          onOption: _send,
                        );
                      },
                    ),
            ),
          ),
        ),
        _InputBar(
          controller: _input,
          focusNode: _focus,
          busy: state.thinking,
          onSend: () => _send(),
          onReceipt: business.flags.receiptScanning && business.role.canRecord ? _scanReceipt : null,
        ),
      ]),
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome({required this.onPick});
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Gap.xl),
      child: Column(children: [
        const SizedBox(height: Gap.xl),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: t.colorScheme.primary.withValues(alpha: 0.1), shape: BoxShape.circle),
          child: Icon(Icons.auto_awesome_rounded, size: 40, color: t.colorScheme.primary),
        ),
        const SizedBox(height: Gap.lg),
        Semantics(header: true, child: Text(context.l10n.aiHeader, style: t.textTheme.headlineMedium, textAlign: TextAlign.center)),
        const SizedBox(height: Gap.sm),
        Text('Sales, purchases, expenses, who owes you — or ask about your numbers.',
            style: t.textTheme.bodyLarge?.copyWith(color: t.colorScheme.onSurfaceVariant), textAlign: TextAlign.center),
        const SizedBox(height: Gap.xl),
        Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
          for (final e in AppConstants.aiExamples)
            ActionChip(avatar: const Icon(Icons.chat_bubble_outline_rounded, size: 18), label: Text(e), onPressed: () => onPick(e)),
        ]),
      ]),
    );
  }
}

class _EntryView extends StatelessWidget {
  const _EntryView({
    required this.entry,
    required this.canRecord,
    required this.onConfirm,
    required this.onCancel,
    required this.onUndo,
    required this.onShare,
    required this.onOption,
  });
  final ChatEntry entry;
  final bool canRecord;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final VoidCallback onUndo;
  final VoidCallback onShare;
  final ValueChanged<String> onOption;

  @override
  Widget build(BuildContext context) {
    final p = entry.proposal;
    if (entry.fromUser || p == null) {
      return AIMessageBubble(text: entry.text, fromUser: entry.fromUser, isError: entry.isError);
    }
    switch (p.kind) {
      case ProposalKind.action:
        final isSale = (p.previewTitle ?? '').toLowerCase().startsWith('sale');
        return AIMessageBubble(
          text: '',
          fromUser: false,
          child: AITransactionPreview(
            proposal: p,
            status: entry.status,
            resultText: entry.resultText,
            onConfirm: canRecord ? onConfirm : null,
            onCancel: onCancel,
            onUndo: entry.transactionId != null ? onUndo : null,
            onShare: isSale && entry.transactionId != null ? onShare : null,
          ),
        );
      case ProposalKind.clarification:
        return AIMessageBubble(
          text: entry.text,
          fromUser: false,
          child: p.options.isEmpty
              ? null
              : Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final o in p.options) ActionChip(label: Text(o.label), onPressed: () => onOption(o.value)),
                ]),
        );
      case ProposalKind.answer:
        return AIMessageBubble(
          text: entry.text,
          fromUser: false,
          child: p.answerRoute == null
              ? null
              : Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: () => context.go(p.answerRoute!),
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: const Text('Open details'),
                  ),
                ),
        );
      case ProposalKind.error:
        return AIMessageBubble(text: entry.text, fromUser: false, isError: true);
    }
  }
}

class _InputBar extends StatelessWidget {
  const _InputBar({required this.controller, required this.focusNode, required this.busy, required this.onSend, this.onReceipt});
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool busy;
  final VoidCallback onSend;
  final VoidCallback? onReceipt;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Material(
      color: t.colorScheme.surface,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.sm),
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (onReceipt != null)
                  IconButton(tooltip: 'Scan a receipt', onPressed: busy ? null : onReceipt, icon: const Icon(Icons.document_scanner_outlined)),
                Expanded(
                  child: CallbackShortcuts(
                    bindings: {const SingleActivator(LogicalKeyboardKey.enter): onSend},
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 500,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => onSend(),
                      style: t.textTheme.bodyLarge,
                      decoration: InputDecoration(
                        hintText: context.l10n.aiHint,
                        counterText: '',
                        prefixIcon: const Icon(Icons.auto_awesome_rounded, color: AppColors.accent),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(28)),
                        enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(28), borderSide: BorderSide(color: t.dividerTheme.color!)),
                        focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(28), borderSide: BorderSide(color: t.colorScheme.primary, width: 2)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: Gap.sm),
                ListenableBuilder(
                  listenable: controller,
                  builder: (_, _) => IconButton.filled(
                    tooltip: 'Send',
                    iconSize: 26,
                    style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
                    onPressed: busy || controller.text.trim().isEmpty ? null : onSend,
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
