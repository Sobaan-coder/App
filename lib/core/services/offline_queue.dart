import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../errors/app_failure.dart';
import '../errors/error_reporter.dart';
import 'connectivity_service.dart';
import 'local_store.dart';
import 'supabase_service.dart';

/// A write that could not reach the server yet. [id] is the transaction's
/// client_ref (idempotency key): replaying it can never create a duplicate,
/// because record_transaction() returns the existing row for a known key.
class PendingOperation {
  const PendingOperation({
    required this.id,
    required this.businessId,
    required this.kind,
    required this.payload,
    required this.createdAt,
    required this.summary,
    this.attempts = 0,
    this.error,
  });

  final String id;
  final String businessId;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final String summary;
  final int attempts;
  final String? error;

  bool get failed => error != null;

  PendingOperation copyWith({int? attempts, String? error, bool clearError = false}) => PendingOperation(
        id: id, businessId: businessId, kind: kind, payload: payload, createdAt: createdAt, summary: summary,
        attempts: attempts ?? this.attempts, error: clearError ? null : (error ?? this.error),
      );

  Map<String, dynamic> toJson() => {
        'id': id, 'business_id': businessId, 'kind': kind, 'payload': payload,
        'created_at': createdAt.toIso8601String(), 'summary': summary, 'attempts': attempts, 'error': error,
      };

  factory PendingOperation.fromJson(Map<String, dynamic> j) => PendingOperation(
        id: j['id'] as String,
        businessId: j['business_id'] as String,
        kind: j['kind'] as String,
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        createdAt: DateTime.parse(j['created_at'] as String),
        summary: j['summary'] as String? ?? '',
        attempts: j['attempts'] as int? ?? 0,
        error: j['error'] as String?,
      );
}

/// Persistent FIFO of pending writes.
class OfflineQueue {
  OfflineQueue(this._store);
  final KeyValueStore _store;
  static const _key = 'bp_offline_queue_v1';

  List<PendingOperation> load() {
    final raw = _store.getString(_key);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((e) => PendingOperation.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(List<PendingOperation> ops) => _store.setString(_key, jsonEncode(ops.map((o) => o.toJson()).toList()));

  /// Adds an operation unless one with the same idempotency key already exists.
  Future<List<PendingOperation>> enqueue(PendingOperation op) async {
    final ops = load();
    if (ops.any((o) => o.id == op.id)) return ops;
    final next = [...ops, op];
    await save(next);
    return next;
  }
}

typedef OperationExecutor = Future<void> Function(PendingOperation op);

class SyncResult {
  const SyncResult(this.synced, this.failed, this.remaining);
  final int synced;
  final int failed;
  final int remaining;
}

/// Replays queued operations in order. Network errors stop the run (still
/// offline); validation errors park the item as failed for the user to review
/// instead of retrying forever.
class SyncEngine {
  SyncEngine(this.queue, this.execute);
  final OfflineQueue queue;
  final OperationExecutor execute;
  bool _running = false;

  Future<SyncResult> flush() async {
    if (_running) return SyncResult(0, 0, queue.load().length);
    _running = true;
    var synced = 0, failed = 0;
    try {
      var ops = queue.load();
      for (final op in List.of(ops)) {
        if (op.failed) continue;
        try {
          await execute(op);
          ops = ops.where((o) => o.id != op.id).toList();
          synced++;
        } catch (e) {
          final f = AppFailure.from(e);
          if (f.isNetwork) {
            ops = ops.map((o) => o.id == op.id ? o.copyWith(attempts: o.attempts + 1) : o).toList();
            break;
          }
          failed++;
          ops = ops.map((o) => o.id == op.id ? o.copyWith(attempts: o.attempts + 1, error: f.message) : o).toList();
          ErrorReporter.report(e, null, source: 'sync', code: 'sync_failure', businessId: op.businessId);
        }
        await queue.save(ops);
      }
      return SyncResult(synced, failed, ops.length);
    } finally {
      _running = false;
    }
  }
}

/// UI-facing state of the queue + automatic sync when connectivity returns.
class OfflineQueueController extends Notifier<List<PendingOperation>> {
  late OfflineQueue _queue;
  late SyncEngine _engine;

  @override
  List<PendingOperation> build() {
    _queue = OfflineQueue(ref.watch(keyValueStoreProvider));
    _engine = SyncEngine(_queue, _execute);
    ref.listen<bool>(isOnlineProvider, (prev, online) {
      if (online && prev == false) sync();
    });
    return _queue.load();
  }

  Future<void> _execute(PendingOperation op) async {
    final client = ref.read(supabaseClientProvider);
    if (client == null) throw StateError('not configured');
    switch (op.kind) {
      case 'record_transaction':
        await client.rpc('record_transaction', params: {'p': {...op.payload, 'source': 'offline'}});
      default:
        throw AppFailure('invalid_input:kind', 'Unsupported offline operation');
    }
  }

  Future<void> enqueue(PendingOperation op) async => state = await _queue.enqueue(op);

  Future<SyncResult> sync() async {
    final r = await _engine.flush();
    state = _queue.load();
    return r;
  }

  Future<void> discard(String id) async {
    final ops = _queue.load().where((o) => o.id != id).toList();
    await _queue.save(ops);
    state = ops;
  }

  Future<void> retry(String id) async {
    final ops = _queue.load().map((o) => o.id == id ? o.copyWith(clearError: true) : o).toList();
    await _queue.save(ops);
    state = ops;
    await sync();
  }
}

final offlineQueueProvider = NotifierProvider<OfflineQueueController, List<PendingOperation>>(OfflineQueueController.new);
