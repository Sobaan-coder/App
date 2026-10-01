import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.readAt,
    this.data = const {},
  });
  final String id;
  final String type;
  final String title;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;
  final Map<String, dynamic> data;
  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    type: j['type'] as String,
    title: j['title'] as String,
    body: j['body'] as String? ?? '',
    createdAt: DateTime.parse(j['created_at'] as String),
    readAt: j['read_at'] == null ? null : DateTime.parse(j['read_at'] as String),
    data: Map<String, dynamic>.from(j['data'] as Map? ?? const {}),
  );
}

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  ref.watch(dataVersionProvider);
  final b = ref.watch(businessProvider);
  try {
    final rows = await ref.supabase
        .from('notifications')
        .select()
        .eq('business_id', b.id)
        .order('created_at', ascending: false)
        .limit(100);
    return rows.map(AppNotification.fromJson).toList();
  } catch (e) {
    throw AppFailure.from(e);
  }
});

final unreadCountProvider = Provider.autoDispose<int>(
  (ref) => ref.watch(notificationsProvider).value?.where((n) => !n.isRead).length ?? 0,
);

Future<void> markAllRead(WidgetRef ref) async {
  final b = ref.read(businessProvider);
  await ref
      .read(supabaseClientProvider)!
      .from('notifications')
      .update({'read_at': DateTime.now().toUtc().toIso8601String()})
      .eq('business_id', b.id)
      .isFilter('read_at', null);
  ref.read(dataVersionProvider.notifier).bump();
}
