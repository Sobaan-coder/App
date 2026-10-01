import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/services/connectivity_service.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/offline_queue.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../domain/transaction.dart';

class RecordResult {
  const RecordResult({required this.clientRef, this.id, this.invoiceNumber, this.pending = false, this.duplicate = false});
  final String clientRef;
  final String? id;
  final String? invoiceNumber;
  final bool pending;
  final bool duplicate;
}

class TransactionQuery {
  const TransactionQuery({this.types = const {}, this.customerId, this.supplierId, this.includeDeleted = false});
  final Set<TransactionType> types;
  final String? customerId;
  final String? supplierId;
  final bool includeDeleted;

  @override
  bool operator ==(Object other) =>
      other is TransactionQuery &&
      other.customerId == customerId &&
      other.supplierId == supplierId &&
      other.includeDeleted == includeDeleted &&
      other.types.length == types.length &&
      other.types.containsAll(types);
  @override
  int get hashCode => Object.hash(customerId, supplierId, includeDeleted, Object.hashAllUnordered(types));
}

class TransactionRepository {
  TransactionRepository(this._ref, this._client, this._businessId);
  final Ref _ref;
  final SupabaseClient _client;
  final String _businessId;
  static const _uuid = Uuid();

  Future<List<AppTransaction>> list(TransactionQuery q, {int page = 0, int pageSize = AppConstants.pageSize}) async {
    try {
      var query = _client.from('transactions').select(AppTransaction.selectColumns).eq('business_id', _businessId);
      if (!q.includeDeleted) query = query.isFilter('deleted_at', null);
      if (q.types.isNotEmpty) query = query.inFilter('type', q.types.map((t) => t.api).toList());
      if (q.customerId != null) query = query.eq('customer_id', q.customerId!);
      if (q.supplierId != null) query = query.eq('supplier_id', q.supplierId!);
      final rows = await query
          .order('transaction_date', ascending: false)
          .order('created_at', ascending: false)
          .range(page * pageSize, page * pageSize + pageSize - 1);
      return rows.map(AppTransaction.fromJson).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<AppTransaction?> get(String id) async {
    try {
      final row = await _client.from('transactions').select(AppTransaction.selectColumns).eq('id', id).maybeSingle();
      return row == null ? null : AppTransaction.fromJson(row);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// Records a transaction. Works offline: the entry is queued with its
  /// idempotency key and synced automatically later — never duplicated.
  Future<RecordResult> record(TransactionDraft draft, {String? clientRef, String summary = ''}) {
    final ref = clientRef ?? _uuid.v4();
    return recordPayload(
      draft.toPayload(businessId: _businessId, clientRef: ref),
      summary: summary,
    );
  }

  Future<RecordResult> recordPayload(Map<String, dynamic> payload, {String summary = ''}) async {
    final clientRef = (payload['client_ref'] as String?) ?? _uuid.v4();
    final p = {...payload, 'business_id': _businessId, 'client_ref': clientRef};
    Future<RecordResult> queue() async {
      await _ref
          .read(offlineQueueProvider.notifier)
          .enqueue(
            PendingOperation(
              id: clientRef,
              businessId: _businessId,
              kind: 'record_transaction',
              payload: p,
              createdAt: DateTime.now().toUtc(),
              summary: summary.isEmpty ? (p['type'] as String? ?? 'entry') : summary,
            ),
          );
      return RecordResult(clientRef: clientRef, pending: true);
    }

    if (!_ref.read(isOnlineProvider)) return queue();
    try {
      final res = Map<String, dynamic>.from(await _client.rpc('record_transaction', params: {'p': p}) as Map);
      _ref.read(dataVersionProvider.notifier).bump();
      return RecordResult(
        clientRef: clientRef,
        id: res['id'] as String?,
        invoiceNumber: res['invoice_number'] as String?,
        duplicate: res['duplicate'] == true,
      );
    } catch (e) {
      final f = AppFailure.from(e);
      if (f.isNetwork) return queue();
      throw f;
    }
  }

  Future<void> update(String id, Map<String, dynamic> patch) async {
    try {
      await _client.rpc('update_transaction', params: {'p_id': id, 'p': patch});
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> softDelete(String id, String reason) async {
    try {
      await _client.rpc('soft_delete_transaction', params: {'p_id': id, 'p_reason': reason});
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final transactionRepositoryProvider = Provider<TransactionRepository>((ref) {
  final b = ref.watch(businessProvider);
  return TransactionRepository(ref, ref.supabase, b.id);
});

/// Most recent transactions (dashboard).
final recentTransactionsProvider = FutureProvider.autoDispose<List<AppTransaction>>((ref) async {
  ref.watch(dataVersionProvider);
  return ref.watch(transactionRepositoryProvider).list(const TransactionQuery(), pageSize: 8);
});

final transactionDetailProvider = FutureProvider.autoDispose.family<AppTransaction?, String>((ref, id) async {
  ref.watch(dataVersionProvider);
  return ref.watch(transactionRepositoryProvider).get(id);
});

/// Paginated, filterable transaction list.
class TransactionListState {
  const TransactionListState({this.items = const [], this.loading = false, this.hasMore = true, this.error});
  final List<AppTransaction> items;
  final bool loading;
  final bool hasMore;
  final AppFailure? error;
}

class TransactionListController extends Notifier<TransactionListState> {
  TransactionListController(this.query);
  final TransactionQuery query;
  int _page = 0;

  @override
  TransactionListState build() {
    ref.watch(dataVersionProvider);
    _page = 0;
    Future.microtask(loadMore);
    return const TransactionListState(loading: true);
  }

  Future<void> loadMore() async {
    if (!ref.mounted) return;
    if (state.loading && state.items.isNotEmpty) return;
    if (!state.hasMore && state.items.isNotEmpty) return;
    state = TransactionListState(items: state.items, loading: true, hasMore: state.hasMore);
    try {
      final page = await ref.read(transactionRepositoryProvider).list(query, page: _page);
      if (!ref.mounted) return;
      _page++;
      state = TransactionListState(items: [...state.items, ...page], hasMore: page.length == AppConstants.pageSize);
    } catch (e) {
      if (!ref.mounted) return;
      state = TransactionListState(items: state.items, hasMore: state.hasMore, error: AppFailure.from(e));
    }
  }

  Future<void> refresh() async {
    _page = 0;
    state = const TransactionListState(loading: true);
    await loadMore();
  }
}

final transactionListProvider = NotifierProvider.autoDispose
    .family<TransactionListController, TransactionListState, TransactionQuery>(TransactionListController.new);

/// Builds a short human summary (used for offline queue & snackbars).
String draftSummary(TransactionDraft d) => '${d.type.label}${d.amount == null ? '' : ' · ${d.amount!.format()}'}';
