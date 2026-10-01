import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../../business/domain/business.dart';

class TeamMember {
  const TeamMember(this.id, this.userId, this.name, this.role);
  final String id;
  final String userId;
  final String name;
  final MemberRole role;
}

class PendingInvite {
  const PendingInvite(this.id, this.email, this.role);
  final String id;
  final String email;
  final MemberRole role;
}

final teamProvider = FutureProvider.autoDispose<(List<TeamMember>, List<PendingInvite>)>((ref) async {
  ref.watch(dataVersionProvider);
  final b = ref.watch(businessProvider);
  final client = ref.supabase;
  try {
    final members = await client.from('business_members').select('id, user_id, role').eq('business_id', b.id).order('created_at');
    final ids = members.map((m) => m['user_id'] as String).toList();
    final profiles = ids.isEmpty ? <Map<String, dynamic>>[] : await client.from('profiles').select('id, full_name').inFilter('id', ids);
    final names = {for (final p in profiles) p['id'] as String: (p['full_name'] as String?) ?? 'Team member'};
    final invites = b.role.canManageTeam
        ? await client.from('business_invitations').select('id, email, role').eq('business_id', b.id).isFilter('accepted_at', null)
        : <Map<String, dynamic>>[];
    return (
      members.map((m) => TeamMember(m['id'] as String, m['user_id'] as String, names[m['user_id']] ?? 'Team member',
          MemberRole.fromApi(m['role'] as String?))).toList(),
      invites.map((i) => PendingInvite(i['id'] as String, i['email'] as String, MemberRole.fromApi(i['role'] as String?))).toList(),
    );
  } catch (e) {
    throw AppFailure.from(e);
  }
});

class TeamActions {
  TeamActions(this.ref);
  final WidgetRef ref;

  Future<void> _run(Future<void> Function() f) async {
    try {
      await f();
      ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> invite(String email, MemberRole role) => _run(() async {
        await ref.read(supabaseClientProvider)!.rpc('invite_member',
            params: {'p_business_id': ref.read(businessProvider).id, 'p_email': email, 'p_role': role.name});
      });

  Future<void> changeRole(String memberId, MemberRole role) => _run(() async {
        await ref.read(supabaseClientProvider)!.rpc('update_member_role', params: {'p_member_id': memberId, 'p_role': role.name});
      });

  Future<void> remove(String memberId) => _run(() async {
        await ref.read(supabaseClientProvider)!.rpc('remove_member', params: {'p_member_id': memberId});
      });

  Future<void> cancelInvite(String inviteId) => _run(() async {
        await ref.read(supabaseClientProvider)!.from('business_invitations').delete().eq('id', inviteId);
      });
}
