import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/supabase_service.dart';
import '../../auth/data/auth_repository.dart';

/// Platform admin access is a separate permission (platform_admins table),
/// unrelated to business roles. All data comes from the admin-actions function.
final isPlatformAdminProvider = FutureProvider<bool>((ref) async {
  final user = ref.watch(currentUserProvider);
  final client = ref.watch(supabaseClientProvider);
  if (user == null || client == null) return false;
  try {
    return await client.rpc('is_platform_admin') == true;
  } catch (_) {
    return false;
  }
});

Future<Map<String, dynamic>> adminAction(Ref ref, String action, [Map<String, dynamic> params = const {}]) async {
  try {
    final res = await ref.supabase.functions.invoke('admin-actions', body: {'action': action, ...params});
    return Map<String, dynamic>.from(res.data as Map);
  } catch (e) {
    throw AppFailure.from(e);
  }
}

final adminDataProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, action) => adminAction(ref, action));
