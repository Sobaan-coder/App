import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';

enum SupportKind { contact, problem, feature }

Future<void> submitSupportRequest(WidgetRef ref, SupportKind kind, String subject, String message) async {
  final client = ref.read(supabaseClientProvider)!;
  final businessId = ref.read(activeBusinessProvider).value?.id;
  try {
    await client.from('support_requests').insert({
      'kind': kind.name,
      'subject': subject.trim(),
      'message': message.trim(),
      'user_id': client.auth.currentUser!.id,
      'business_id': ?businessId,
    });
  } catch (e) {
    throw AppFailure.from(e);
  }
}
