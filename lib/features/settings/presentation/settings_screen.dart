import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/app_preferences.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/share_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/app_bottom_sheet.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/confirm_dialog.dart';
import '../../../shared/widgets/money_field.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../admin/data/admin_repository.dart';
import '../../auth/data/auth_repository.dart';
import '../../business/data/business_repository.dart';
import '../../business/domain/business.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = ref.watch(businessProvider);
    final prefs = ref.watch(appPreferencesProvider);
    final isAdmin = ref.watch(isPlatformAdminProvider).value ?? false;
    final user = ref.watch(currentUserProvider);
    final t = Theme.of(context);

    Future<void> updateSetting(Map<String, dynamic> fields) async {
      try {
        await ref.read(businessRepositoryProvider).updateSettings(b.id, fields);
        ref.invalidate(activeBusinessProvider);
      } catch (e) {
        if (context.mounted) showError(context, e);
      }
    }

    Widget section(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Semantics(
        header: true,
        child: Text(
          title.toUpperCase(),
          style: t.textTheme.labelMedium?.copyWith(color: t.colorScheme.primary, letterSpacing: 1),
        ),
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.navSettings), actions: const [ShellActions()]),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 48),
            children: [
              ListTile(
                leading: CircleAvatar(child: Text((user?.email ?? '?')[0].toUpperCase())),
                title: Text((user?.userMetadata?['full_name'] as String?) ?? 'Your account'),
                subtitle: Text('${user?.email ?? ''} · ${b.role.label} at ${b.business.name}'),
              ),
              section('Business'),
              ListTile(
                leading: const Icon(Icons.storefront_outlined),
                title: const Text('Business profile'),
                subtitle: Text('${b.business.name} · ${b.currency} · ${b.business.timezone}'),
                enabled: b.role.canManageSettings,
                onTap: () => showAppBottomSheet(
                  context,
                  title: 'Business profile',
                  child: _BusinessProfileForm(active: b),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.group_outlined),
                title: const Text('Team & roles'),
                subtitle: const Text('Invite staff and control what they can do'),
                onTap: () => context.push('/settings/team'),
              ),
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined),
                title: const Text('Plan & billing'),
                onTap: () => context.push('/subscription'),
              ),
              ListTile(
                leading: const Icon(Icons.import_export_rounded),
                title: const Text('Import & export'),
                subtitle: const Text('CSV import, templates, export my data'),
                onTap: () => context.push('/settings/import-export'),
              ),
              section('Assistant'),
              SwitchListTile(
                secondary: const Icon(Icons.bolt_rounded),
                title: const Text('Record simple entries instantly'),
                subtitle: const Text(
                  'Low-risk, high-confidence entries are saved right away with an Undo button. '
                  'Large amounts, payments and anything uncertain always ask first.',
                ),
                value: b.settings.aiAutoRecordLowRisk,
                onChanged: b.role.canManageSettings ? (v) => updateSetting({'ai_auto_record_low_risk': v}) : null,
              ),
              ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: const Text('Always confirm amounts above'),
                subtitle: Text(Money(b.settings.aiConfirmThresholdMinor, b.currency).format()),
                enabled: b.role.canManageSettings,
                onTap: () async {
                  final ctrl = TextEditingController(
                    text: Money(b.settings.aiConfirmThresholdMinor, b.currency).toDecimalString(),
                  );
                  final v = await showDialog<Money>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Confirmation threshold'),
                      content: MoneyField(controller: ctrl, currency: b.currency, label: 'Amount'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, MoneyField.read(ctrl, b.currency)),
                          child: const Text('Save'),
                        ),
                      ],
                    ),
                  );
                  if (v != null) await updateSetting({'ai_confirm_threshold_minor': v.minor});
                },
              ),
              section('Notifications'),
              for (final (key, label, value) in [
                ('low_stock_alerts', 'Low stock alerts', b.settings.lowStockAlerts),
                ('daily_summary', 'Daily sales summary', b.settings.dailySummary),
                ('monthly_report', 'Monthly report', b.settings.monthlyReport),
                ('payment_due_reminders', 'Payment due reminders', b.settings.paymentDueReminders),
              ])
                SwitchListTile(
                  title: Text(label),
                  value: value,
                  onChanged: b.role.canManageSettings ? (v) => updateSetting({key: v}) : null,
                ),
              section('Appearance'),
              ListTile(
                leading: const Icon(Icons.dark_mode_outlined),
                title: const Text('Theme'),
                trailing: SegmentedButton<ThemeMode>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                    ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
                    ButtonSegment(value: ThemeMode.system, label: Text('System')),
                  ],
                  selected: {prefs.themeMode},
                  onSelectionChanged: (s) => ref.read(appPreferencesProvider.notifier).setThemeMode(s.first),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.translate_rounded),
                title: const Text('Language'),
                trailing: DropdownButton<String>(
                  value: prefs.locale?.languageCode ?? 'system',
                  underline: const SizedBox.shrink(),
                  items: const [
                    DropdownMenuItem(value: 'system', child: Text('System')),
                    DropdownMenuItem(value: 'en', child: Text('English')),
                    DropdownMenuItem(value: 'ur', child: Text('اردو (preview)')),
                    DropdownMenuItem(value: 'ar', child: Text('العربية (preview)')),
                  ],
                  onChanged: (v) =>
                      ref.read(appPreferencesProvider.notifier).setLocale(v == null || v == 'system' ? null : Locale(v)),
                ),
              ),
              section('Help'),
              ListTile(
                leading: const Icon(Icons.help_outline_rounded),
                title: Text(context.l10n.navHelp),
                onTap: () => context.push('/help'),
              ),
              ListTile(
                leading: const Icon(Icons.privacy_tip_outlined),
                title: const Text('Privacy policy'),
                onTap: () => launchUrl(Uri.parse(Env.privacyUrl)),
              ),
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('Terms of service'),
                onTap: () => launchUrl(Uri.parse(Env.termsUrl)),
              ),
              if (isAdmin)
                ListTile(
                  leading: const Icon(Icons.admin_panel_settings_outlined),
                  title: const Text('Admin console'),
                  onTap: () => context.go('/admin'),
                ),
              const SizedBox(height: Gap.lg),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: AppButton(
                  label: context.l10n.actionSignOut,
                  variant: AppButtonVariant.secondary,
                  icon: Icons.logout_rounded,
                  onPressed: () => ref.read(authRepositoryProvider).signOut(),
                ),
              ),
              if (b.role.canManageBilling) ...[
                const SizedBox(height: Gap.md),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: AppButton(
                    label: 'Delete this business',
                    variant: AppButtonVariant.text,
                    onPressed: () async {
                      if (!await showConfirmDialog(
                        context,
                        title: 'Delete ${b.business.name}?',
                        message: 'Export your data first. The business will be removed for all team members.',
                        confirmLabel: 'Delete',
                        destructive: true,
                      )) {
                        return;
                      }
                      try {
                        await ref.read(businessRepositoryProvider).deleteBusiness(b.id);
                        ref.invalidate(membershipsProvider);
                        if (context.mounted) context.go('/');
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      }
                    },
                  ),
                ),
              ],
              const SizedBox(height: Gap.lg),
              Center(child: Text('${AppConstants.appName} · ${Env.appEnv}', style: t.textTheme.labelSmall)),
            ],
          ),
        ),
      ),
    );
  }
}

class _BusinessProfileForm extends ConsumerStatefulWidget {
  const _BusinessProfileForm({required this.active});
  final ActiveBusiness active;
  @override
  ConsumerState<_BusinessProfileForm> createState() => _BusinessProfileFormState();
}

class _BusinessProfileFormState extends ConsumerState<_BusinessProfileForm> {
  late final b = widget.active.business;
  late final _name = TextEditingController(text: b.name);
  late final _phone = TextEditingController(text: b.phone);
  late final _email = TextEditingController(text: b.email);
  late final _address = TextEditingController(text: b.address);
  late final _prefix = TextEditingController(text: b.invoicePrefix);
  late final _footer = TextEditingController(text: widget.active.settings.invoiceFooter);
  late final _tax = TextEditingController(text: (b.taxRateBp / 100).toString());
  late String _tz = b.timezone;
  late bool _taxEnabled = b.taxEnabled;
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _address, _prefix, _footer, _tax]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(label: 'Business name', controller: _name),
        const SizedBox(height: Gap.md),
        AppTextField(label: 'Phone', controller: _phone, keyboardType: TextInputType.phone),
        const SizedBox(height: Gap.md),
        AppTextField(label: 'Email', controller: _email, keyboardType: TextInputType.emailAddress),
        const SizedBox(height: Gap.md),
        AppTextField(label: 'Address', controller: _address, maxLines: 2),
        const SizedBox(height: Gap.md),
        DropdownButtonFormField<String>(
          initialValue: _tz,
          decoration: const InputDecoration(labelText: 'Time zone'),
          items: [
            for (final z in {...AppConstants.timezones, _tz}) DropdownMenuItem(value: z, child: Text(z)),
          ],
          onChanged: (v) => setState(() => _tz = v!),
        ),
        const SizedBox(height: Gap.md),
        InputDecorator(
          decoration: const InputDecoration(labelText: 'Currency'),
          child: Text('${b.currency} (fixed once records exist)'),
        ),
        const SizedBox(height: Gap.md),
        Row(
          children: [
            Expanded(
              child: AppTextField(label: 'Invoice prefix', controller: _prefix),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Tax'),
                value: _taxEnabled,
                onChanged: (v) => setState(() => _taxEnabled = v),
              ),
            ),
          ],
        ),
        if (_taxEnabled)
          AppTextField(label: 'Tax rate %', controller: _tax, keyboardType: const TextInputType.numberWithOptions(decimal: true)),
        const SizedBox(height: Gap.md),
        AppTextField(label: 'Invoice footer', controller: _footer, maxLines: 2),
        const SizedBox(height: Gap.xl),
        AppButton(
          label: 'Save',
          loading: _saving,
          expand: true,
          onPressed: () async {
            setState(() => _saving = true);
            String? n(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
            try {
              final repo = ref.read(businessRepositoryProvider);
              await repo.updateBusiness(b.id, {
                'name': _name.text.trim(),
                'phone': n(_phone),
                'email': n(_email),
                'address': n(_address),
                'timezone': _tz,
                'invoice_prefix': _prefix.text.trim().isEmpty ? 'INV-' : _prefix.text.trim(),
                'tax_enabled': _taxEnabled,
                'tax_rate_bp': ((double.tryParse(_tax.text) ?? 0) * 100).round().clamp(0, 10000),
              });
              await repo.updateSettings(b.id, {'invoice_footer': _footer.text.trim()});
              ref.invalidate(membershipsProvider);
              ref.read(dataVersionProvider.notifier).bump();
              if (context.mounted) Navigator.pop(context);
            } catch (e) {
              if (context.mounted) showError(context, e);
            } finally {
              if (mounted) setState(() => _saving = false);
            }
          },
        ),
      ],
    );
  }
}

/// "Export My Data": full JSON export of the business (owner/admin).
Future<void> exportMyData(BuildContext context, WidgetRef ref) async {
  final b = ref.read(businessProvider);
  try {
    final data = await ref.read(businessRepositoryProvider).exportData(b.id);
    final bytes = Uint8List.fromList(utf8.encode(const JsonEncoder.withIndent('  ').convert(data)));
    await ShareService.shareFile(
      bytes,
      'businesspilot-export-${DateTime.now().toIso8601String().substring(0, 10)}.json',
      'application/json',
    );
  } catch (e) {
    if (context.mounted) showError(context, e);
  }
}
