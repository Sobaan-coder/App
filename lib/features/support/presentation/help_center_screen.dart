import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_bottom_sheet.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/states.dart';
import '../data/support_repository.dart';

const faqs = <(String, String)>[
  (
    'How do I record a sale?',
    'Open the assistant and type it naturally, e.g. “Sold 3 burgers for 1500 cash”. Check the preview and tap Confirm. You can also use the + / Record button for a form.',
  ),
  (
    'Does the AI ever record things on its own?',
    'Only if you turn on “Record simple entries instantly” in Settings, and only for low-risk entries. Payments, large amounts, new contacts and anything uncertain always ask first. Every entry can be undone or deleted (and the deletion is logged).',
  ),
  (
    'Where do the numbers in answers come from?',
    'From your records in the database. The assistant never makes up figures — if something can’t be calculated (like profit without cost prices) it tells you.',
  ),
  (
    'Why is my profit “unavailable”?',
    'Profit needs the cost of what you sold. Add cost prices to your products and record sales with items. Until then we show revenue, expenses and cash flow instead of guessing.',
  ),
  (
    'Can I use it without internet?',
    'Yes. Entries made with the Record button are saved on your device and synced automatically when you’re back online — never duplicated. The assistant itself needs internet.',
  ),
  (
    'Is my data safe?',
    'Each business’s data is isolated at the database level. Staff only see what their role allows. AI keys never live on your phone, and we only send the AI the sentence you typed.',
  ),
  (
    'How do I add my staff?',
    'Settings → Team & roles → Invite. Choose a role: Employee (records entries), Manager (edits prices & records), Admin, or Viewer (read-only).',
  ),
  ('Can I export my data?', 'Yes — Reports → Export (CSV/PDF), or Settings → Import & export → Export my data.'),
];

class HelpCenterScreen extends ConsumerWidget {
  const HelpCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    void form(SupportKind kind, String title) => showAppBottomSheet(
      context,
      title: title,
      child: _SupportForm(kind: kind),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: ListView(
            padding: const EdgeInsets.all(Gap.lg),
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _Tile(
                    icon: Icons.chat_outlined,
                    label: 'Contact support',
                    onTap: () => form(SupportKind.contact, 'Contact support'),
                  ),
                  _Tile(
                    icon: Icons.bug_report_outlined,
                    label: 'Report a problem',
                    onTap: () => form(SupportKind.problem, 'Report a problem'),
                  ),
                  _Tile(
                    icon: Icons.lightbulb_outline_rounded,
                    label: 'Request a feature',
                    onTap: () => form(SupportKind.feature, 'Request a feature'),
                  ),
                  _Tile(
                    icon: Icons.mail_outline_rounded,
                    label: 'Email us',
                    onTap: () => launchUrl(Uri(scheme: 'mailto', path: Env.supportEmail)),
                  ),
                ],
              ),
              const SizedBox(height: Gap.xl),
              Text('Frequently asked questions', style: t.textTheme.titleLarge),
              const SizedBox(height: Gap.sm),
              for (final (q, a) in faqs)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ExpansionTile(
                    title: Text(q, style: t.textTheme.titleSmall),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    children: [Text(a)],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 170,
    child: Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: Gap.md),
              Text(label, style: Theme.of(context).textTheme.titleSmall),
            ],
          ),
        ),
      ),
    ),
  );
}

class _SupportForm extends ConsumerStatefulWidget {
  const _SupportForm({required this.kind});
  final SupportKind kind;
  @override
  ConsumerState<_SupportForm> createState() => _SupportFormState();
}

class _SupportFormState extends ConsumerState<_SupportForm> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AppTextField(label: 'Subject', controller: _subject, autofocus: true),
      const SizedBox(height: Gap.md),
      AppTextField(
        label: widget.kind == SupportKind.problem ? 'What happened? What did you expect?' : 'Message',
        controller: _message,
        maxLines: 6,
      ),
      const SizedBox(height: Gap.sm),
      const Text('Please don’t include passwords or card numbers.'),
      const SizedBox(height: Gap.lg),
      AppButton(
        label: 'Send',
        loading: _sending,
        expand: true,
        onPressed: () async {
          if (_subject.text.trim().isEmpty || _message.text.trim().isEmpty) {
            return showMessage(context, 'Please fill in both fields');
          }
          setState(() => _sending = true);
          try {
            await submitSupportRequest(ref, widget.kind, _subject.text, _message.text);
            if (context.mounted) {
              Navigator.pop(context);
              showMessage(context, 'Thanks! We’ll get back to you by email.');
            }
          } catch (e) {
            if (context.mounted) showError(context, e);
          } finally {
            if (mounted) setState(() => _sending = false);
          }
        },
      ),
    ],
  );
}
