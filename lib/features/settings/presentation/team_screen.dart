import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_bottom_sheet.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/confirm_dialog.dart';
import '../../../shared/widgets/states.dart';
import '../../auth/data/auth_repository.dart';
import '../../business/data/business_repository.dart';
import '../../business/domain/business.dart';
import '../data/team_repository.dart';

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = ref.watch(businessProvider);
    final me = ref.watch(currentUserProvider)?.id;
    final actions = TeamActions(ref);
    return Scaffold(
      appBar: AppBar(title: const Text('Team & roles')),
      floatingActionButton: b.role.canManageTeam
          ? FloatingActionButton.extended(
              onPressed: () => showAppBottomSheet(context, title: 'Invite a team member', child: _InviteForm(actions: actions, myRole: b.role)),
              icon: const Icon(Icons.person_add_alt_rounded),
              label: const Text('Invite'),
            )
          : null,
      body: AsyncView(
        value: ref.watch(teamProvider),
        onRetry: () => ref.invalidate(teamProvider),
        builder: (data) {
          final (members, invites) = data;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: ListView(padding: const EdgeInsets.fromLTRB(0, 8, 0, 96), children: [
                for (final m in members)
                  ListTile(
                    leading: CircleAvatar(child: Text(m.name[0].toUpperCase())),
                    title: Text(m.userId == me ? '${m.name} (you)' : m.name),
                    subtitle: Text(m.role.description),
                    trailing: b.role.canManageTeam && m.userId != me
                        ? PopupMenuButton<String>(
                            tooltip: 'Change role',
                            onSelected: (v) async {
                              try {
                                if (v == 'remove') {
                                  if (await showConfirmDialog(context, title: 'Remove ${m.name}?', message: 'They will lose access to this business.',
                                      confirmLabel: 'Remove', destructive: true)) {
                                    await actions.remove(m.id);
                                  }
                                } else {
                                  await actions.changeRole(m.id, MemberRole.fromApi(v));
                                }
                              } catch (e) {
                                if (context.mounted) showError(context, e);
                              }
                            },
                            itemBuilder: (_) => [
                              for (final r in MemberRole.values)
                                if (b.role == MemberRole.owner || r.rank < MemberRole.admin.rank)
                                  CheckedPopupMenuItem(value: r.name, checked: r == m.role, child: Text(r.label)),
                              const PopupMenuDivider(),
                              const PopupMenuItem(value: 'remove', child: Text('Remove from business')),
                            ],
                            child: Chip(label: Text(m.role.label)),
                          )
                        : Chip(label: Text(m.role.label)),
                  ),
                if (invites.isNotEmpty) ...[
                  const Padding(padding: EdgeInsets.fromLTRB(16, 24, 16, 8), child: Text('Pending invitations')),
                  for (final i in invites)
                    ListTile(
                      leading: const Icon(Icons.mail_outline_rounded),
                      title: Text(i.email),
                      subtitle: Text('${i.role.label} · joins automatically when they sign up with this email'),
                      trailing: IconButton(tooltip: 'Cancel invitation', icon: const Icon(Icons.close_rounded),
                          onPressed: () => actions.cancelInvite(i.id)),
                    ),
                ],
              ]),
            ),
          );
        },
      ),
    );
  }
}

class _InviteForm extends StatefulWidget {
  const _InviteForm({required this.actions, required this.myRole});
  final TeamActions actions;
  final MemberRole myRole;
  @override
  State<_InviteForm> createState() => _InviteFormState();
}

class _InviteFormState extends State<_InviteForm> {
  final _email = TextEditingController();
  MemberRole _role = MemberRole.employee;
  bool _saving = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final roles = MemberRole.values.where((r) => r != MemberRole.owner && (widget.myRole == MemberRole.owner || r != MemberRole.admin));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AppTextField(label: 'Email', controller: _email, keyboardType: TextInputType.emailAddress, autofocus: true),
      const SizedBox(height: Gap.lg),
      RadioGroup<MemberRole>(
        groupValue: _role,
        onChanged: (v) => setState(() => _role = v!),
        child: Column(children: [
          for (final r in roles) RadioListTile<MemberRole>(value: r, title: Text(r.label), subtitle: Text(r.description)),
        ]),
      ),
      const SizedBox(height: Gap.lg),
      AppButton(
        label: 'Send invite',
        loading: _saving,
        expand: true,
        onPressed: () async {
          if (Validators.email(_email.text) != null) return showMessage(context, 'Enter a valid email');
          setState(() => _saving = true);
          try {
            await widget.actions.invite(_email.text.trim(), _role);
            if (context.mounted) {
              Navigator.pop(context);
              showMessage(context, 'Invitation saved. They’ll join automatically when they sign in with ${_email.text.trim()}.');
            }
          } catch (e) {
            if (context.mounted) showError(context, e);
          } finally {
            if (mounted) setState(() => _saving = false);
          }
        },
      ),
    ]);
  }
}
