import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/connectivity_service.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/ai_widgets.dart';
import '../../business/data/business_repository.dart';
import '../../inventory/data/inventory_repository.dart';
import '../../inventory/domain/inventory_movement.dart';
import '../../products/data/product_repository.dart';
import '../../products/domain/product.dart';
import '../../transactions/data/transaction_repository.dart';
import '../data/ai_repository.dart';
import '../domain/ai_proposal.dart';

class ChatEntry {
  ChatEntry({
    required this.id,
    required this.fromUser,
    required this.text,
    this.proposal,
    this.status = PreviewStatus.pending,
    this.resultText,
    this.clientRef,
    this.transactionId,
    this.isError = false,
  });

  final String id;
  final bool fromUser;
  final String text;
  final AiProposal? proposal;
  PreviewStatus status;
  String? resultText;

  /// Idempotency key reserved when the proposal arrives: double taps or
  /// retries can never record the same entry twice.
  final String? clientRef;
  String? transactionId;
  final bool isError;
}

class AiChatState {
  const AiChatState({this.entries = const [], this.thinking = false});
  final List<ChatEntry> entries;
  final bool thinking;
  AiChatState copy({List<ChatEntry>? entries, bool? thinking}) =>
      AiChatState(entries: entries ?? this.entries, thinking: thinking ?? this.thinking);
}

class AiChatController extends Notifier<AiChatState> {
  static const _uuid = Uuid();

  @override
  AiChatState build() {
    ref.watch(businessProvider.select((b) => b.id)); // new conversation per business
    return const AiChatState();
  }

  void _add(ChatEntry e) => state = state.copy(entries: [...state.entries, e]);
  void _touch() => state = state.copy(entries: [...state.entries]);

  Future<void> send(String text) async {
    final input = text.trim();
    if (input.isEmpty || state.thinking) return;
    _add(ChatEntry(id: _uuid.v4(), fromUser: true, text: input));
    if (!ref.read(isOnlineProvider)) {
      _add(
        ChatEntry(
          id: _uuid.v4(),
          fromUser: false,
          isError: true,
          text: 'You’re offline. The assistant needs internet — use Record to add entries manually and they’ll sync later.',
        ),
      );
      return;
    }
    state = state.copy(thinking: true);
    try {
      final business = ref.read(businessProvider);
      final p = await ref.read(aiRepositoryProvider).process(business.id, input);
      final entry = ChatEntry(
        id: _uuid.v4(),
        fromUser: false,
        text: switch (p.kind) {
          ProposalKind.answer => p.answerText ?? p.message,
          ProposalKind.clarification => p.question ?? p.message,
          ProposalKind.error => p.message,
          ProposalKind.action => '',
        },
        proposal: p,
        clientRef: p.kind == ProposalKind.action ? _uuid.v4() : null,
        isError: p.kind == ProposalKind.error,
      );
      _add(entry);
      if (p.kind == ProposalKind.action && p.autoCommit) await confirm(entry.id);
    } catch (e) {
      _add(ChatEntry(id: _uuid.v4(), fromUser: false, isError: true, text: AppFailure.from(e).message));
    } finally {
      state = state.copy(thinking: false);
    }
  }

  Future<void> sendReceipt(Future<AiProposal> Function() upload) async {
    state = state.copy(thinking: true);
    _add(ChatEntry(id: _uuid.v4(), fromUser: true, text: '📷 Receipt photo'));
    try {
      final p = await upload();
      _add(
        ChatEntry(
          id: _uuid.v4(),
          fromUser: false,
          text: p.kind == ProposalKind.action ? '' : (p.question ?? p.message),
          proposal: p,
          clientRef: _uuid.v4(),
          isError: p.kind == ProposalKind.error,
        ),
      );
    } catch (e) {
      _add(ChatEntry(id: _uuid.v4(), fromUser: false, isError: true, text: AppFailure.from(e).message));
    } finally {
      state = state.copy(thinking: false);
    }
  }

  ChatEntry? _find(String id) => state.entries.where((e) => e.id == id).firstOrNull;

  /// Executes a confirmed proposal through the normal, server-validated write
  /// paths. "Recorded" is only shown after the backend confirms.
  Future<void> confirm(String entryId) async {
    final entry = _find(entryId);
    final action = entry?.proposal?.action;
    if (entry == null || action == null || entry.status == PreviewStatus.committing || entry.status == PreviewStatus.committed) {
      return;
    }
    entry.status = PreviewStatus.committing;
    _touch();
    final business = ref.read(businessProvider);
    final payload = action.payload;
    try {
      switch (action.kind) {
        case ProposalActionKind.recordTransaction:
          final res = await ref.read(transactionRepositoryProvider).recordPayload(
            {...payload, 'client_ref': entry.clientRef},
            summary:
                '${entry.proposal!.previewTitle ?? 'Entry'} · ${entry.proposal!.lines.where((l) => l.label == 'Amount').firstOrNull?.value ?? ''}',
          );
          entry.transactionId = res.id;
          final title = (entry.proposal!.previewTitle ?? 'Entry').replaceAll(' detected', '');
          entry.resultText = res.pending
              ? 'Saved offline — will sync automatically'
              : '$title recorded${res.invoiceNumber != null ? ' · ${res.invoiceNumber}' : ''}';
        case ProposalActionKind.addProduct:
          final c = business.currency;
          int? minor(String k) => (payload[k] as num?)?.toInt();
          await ref
              .read(productRepositoryProvider)
              .create(
                Product(
                  id: '',
                  businessId: business.id,
                  name: payload['name'] as String,
                  currency: c,
                  sellingPrice: minor('selling_price_minor') == null ? null : Money(minor('selling_price_minor')!, c),
                  costPrice: minor('cost_price_minor') == null ? null : Money(minor('cost_price_minor')!, c),
                  unit: payload['unit'] as String? ?? 'pcs',
                  sku: payload['sku'] as String?,
                ),
              );
          entry.resultText = 'Product added';
        case ProposalActionKind.updateProduct:
          await ref.read(productRepositoryProvider).update(payload['product_id'] as String, {
            if (payload.containsKey('selling_price_minor')) 'selling_price_minor': payload['selling_price_minor'],
            if (payload.containsKey('cost_price_minor')) 'cost_price_minor': payload['cost_price_minor'],
          });
          entry.resultText = 'Product updated';
        case ProposalActionKind.adjustInventory:
          final stock = await ref
              .read(inventoryRepositoryProvider)
              .adjust(
                payload['product_id'] as String,
                MovementType.fromApi(payload['type'] as String),
                (payload['quantity_change'] as num).toDouble(),
                note: payload['note'] as String?,
              );
          entry.resultText = 'Stock updated · now ${stock.toStringAsFixed(stock == stock.roundToDouble() ? 0 : 2)}';
      }
      entry.status = PreviewStatus.committed;
    } catch (e) {
      entry.status = PreviewStatus.failed;
      entry.resultText = AppFailure.from(e).message;
    }
    _touch();
  }

  void cancel(String entryId) {
    final e = _find(entryId);
    if (e == null || e.status != PreviewStatus.pending) return;
    e.status = PreviewStatus.cancelled;
    _touch();
  }

  Future<void> undo(String entryId) async {
    final e = _find(entryId);
    if (e?.transactionId == null) return;
    try {
      await ref.read(transactionRepositoryProvider).softDelete(e!.transactionId!, 'Undone from assistant');
      e.status = PreviewStatus.cancelled;
      e.resultText = null;
    } catch (err) {
      e!.resultText = AppFailure.from(err).message;
    }
    _touch();
  }

  void clear() => state = const AiChatState();
}

final aiChatProvider = NotifierProvider<AiChatController, AiChatState>(AiChatController.new);
