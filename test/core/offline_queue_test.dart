import 'package:businesspilot/core/services/local_store.dart';
import 'package:businesspilot/core/services/offline_queue.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

PendingOperation op(String id) => PendingOperation(
  id: id,
  businessId: 'b1',
  kind: 'record_transaction',
  payload: {'type': 'sale', 'amount_minor': 1000, 'client_ref': id},
  createdAt: DateTime.utc(2026, 1, 1),
  summary: 'Sale',
);

void main() {
  late MemoryStore store;
  late OfflineQueue queue;

  setUp(() {
    store = MemoryStore();
    queue = OfflineQueue(store);
  });

  test('enqueue is idempotent per client_ref', () async {
    await queue.enqueue(op('a'));
    await queue.enqueue(op('a'));
    expect(queue.load().length, 1);
  });

  test('queue survives restarts (persisted)', () async {
    await queue.enqueue(op('a'));
    expect(OfflineQueue(store).load().single.id, 'a');
  });

  test('successful sync removes items in order', () async {
    await queue.enqueue(op('a'));
    await queue.enqueue(op('b'));
    final sent = <String>[];
    final r = await SyncEngine(queue, (o) async => sent.add(o.id)).flush();
    expect(sent, ['a', 'b']);
    expect(r.synced, 2);
    expect(queue.load(), isEmpty);
  });

  test('network failure stops the run and keeps items for later', () async {
    await queue.enqueue(op('a'));
    await queue.enqueue(op('b'));
    final r = await SyncEngine(queue, (o) async => throw Exception('SocketException: Failed host lookup')).flush();
    expect(r.synced, 0);
    expect(queue.load().length, 2);
    expect(queue.load().first.attempts, 1);
    expect(queue.load().first.failed, isFalse);
  });

  test('validation failure parks the item and continues', () async {
    await queue.enqueue(op('bad'));
    await queue.enqueue(op('good'));
    final r = await SyncEngine(queue, (o) async {
      if (o.id == 'bad') throw const PostgrestException(message: 'invalid_input:amount');
    }).flush();
    expect(r.synced, 1);
    expect(r.failed, 1);
    final left = queue.load();
    expect(left.single.id, 'bad');
    expect(left.single.failed, isTrue);
    expect(left.single.error, isNotEmpty);
  });

  test('replaying after a lost response cannot duplicate (server returns duplicate)', () async {
    // Simulates the server-side idempotency of record_transaction().
    final server = <String>{};
    Future<void> exec(PendingOperation o) async => server.add(o.payload['client_ref'] as String);
    await queue.enqueue(op('x'));
    await SyncEngine(queue, exec).flush();
    await queue.enqueue(op('x')); // same entry queued again (e.g. retry after timeout)
    await SyncEngine(queue, exec).flush();
    expect(server.length, 1);
  });
}
