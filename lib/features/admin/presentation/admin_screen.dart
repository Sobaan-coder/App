import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/supabase_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/metric_card.dart';
import '../../../shared/widgets/states.dart';
import '../data/admin_repository.dart';

/// Separate platform-admin console (not part of the business app shell).
/// Shows aggregates and operational data only — never transaction contents.
class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});
  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
  int _tab = 0;
  static const _tabs = [
    ('overview', 'Overview', Icons.dashboard_outlined),
    ('businesses', 'Businesses', Icons.storefront_outlined),
    ('ai_usage', 'AI usage', Icons.auto_awesome_outlined),
    ('errors', 'Errors', Icons.error_outline_rounded),
    ('support', 'Support', Icons.support_agent_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(isPlatformAdminProvider);
    return isAdmin.when(
      loading: () => const Scaffold(body: LoadingState()),
      error: (e, _) => Scaffold(body: ErrorState(error: e)),
      data: (ok) {
        if (!ok) {
          return Scaffold(
            appBar: AppBar(),
            body: EmptyState(icon: Icons.lock_outline_rounded, title: 'Admins only',
                message: 'This area is for BusinessPilot staff.', actionLabel: 'Back to app', onAction: () => context.go('/')),
          );
        }
        final action = _tabs[_tab].$1;
        return Scaffold(
          appBar: AppBar(
            title: const Row(children: [BrandMark(size: 28), SizedBox(width: 10), Text('Admin console')]),
            actions: [TextButton.icon(onPressed: () => context.go('/'), icon: const Icon(Icons.exit_to_app_rounded), label: const Text('Exit'))],
          ),
          body: Row(children: [
            NavigationRail(
              selectedIndex: _tab,
              labelType: NavigationRailLabelType.all,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: [for (final t in _tabs) NavigationRailDestination(icon: Icon(t.$3), label: Text(t.$2))],
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: AsyncView<Map<String, dynamic>>(
                value: ref.watch(adminDataProvider(action)),
                onRetry: () => ref.invalidate(adminDataProvider(action)),
                builder: (data) => switch (action) {
                  'overview' => _overview(data),
                  'businesses' => _businesses(data),
                  'ai_usage' => _aiUsage(data),
                  'errors' => _list(data['errors'] as List, (e) => ListTile(
                      leading: const Icon(Icons.error_outline_rounded),
                      title: Text('${e['source']} · ${e['code']}'),
                      subtitle: Text('${e['message'] ?? ''}\n${e['created_at']}'),
                      isThreeLine: true)),
                  _ => _support(data),
                },
              ),
            ),
          ]),
        );
      },
    );
  }

  Widget _overview(Map<String, dynamic> d) {
    final ai = Map<String, dynamic>.from(d['ai_30d'] as Map? ?? {});
    final plans = Map<String, dynamic>.from(d['subscriptions_by_plan'] as Map? ?? {});
    final cards = [
      MetricCard(label: 'Users', value: '${d['users']}', icon: Icons.person_outline_rounded),
      MetricCard(label: 'Businesses', value: '${d['businesses']}', icon: Icons.storefront_outlined),
      MetricCard(label: 'Flagged', value: '${d['flagged']}', icon: Icons.flag_outlined),
      MetricCard(label: 'Errors (24h)', value: '${d['errors_24h']}', icon: Icons.error_outline_rounded),
      MetricCard(label: 'Open support', value: '${d['open_support']}', icon: Icons.support_agent_rounded),
      MetricCard(label: 'AI requests (30d)', value: '${ai['requests']}', icon: Icons.auto_awesome_outlined,
          caption: '${ai['llm_requests']} used the LLM · ${ai['tokens']} tokens'),
    ];
    return ListView(padding: const EdgeInsets.all(Gap.xl), children: [
      Wrap(spacing: 12, runSpacing: 12, children: [for (final c in cards) SizedBox(width: 240, child: c)]),
      const SizedBox(height: Gap.xl),
      Text('Active subscriptions', style: Theme.of(context).textTheme.titleMedium),
      for (final e in plans.entries) ListTile(title: Text(e.key), trailing: Text('${e.value}')),
      ListTile(leading: const Icon(Icons.health_and_safety_outlined), title: const Text('System health'),
          subtitle: Text('Edge functions responding · checked ${(d['system'] as Map?)?['checked_at']}')),
    ]);
  }

  Widget _businesses(Map<String, dynamic> d) => _list(d['businesses'] as List, (b) {
        final sub = (b['subscriptions'] is List && (b['subscriptions'] as List).isNotEmpty)
            ? (b['subscriptions'] as List).first
            : b['subscriptions'];
        final flagged = b['is_flagged'] == true;
        return ListTile(
          leading: Icon(flagged ? Icons.flag_rounded : Icons.storefront_outlined, color: flagged ? Theme.of(context).colorScheme.error : null),
          title: Text('${b['name']}${b['is_demo'] == true ? ' (demo)' : ''}'),
          subtitle: Text('${b['business_type']} · ${b['currency']} · ${sub is Map ? '${sub['plan_id']} (${sub['status']})' : 'no plan'}'),
          trailing: TextButton(
            onPressed: () async {
              try {
                await adminAction(ref.read(supabaseClientProvider)!, 'flag_business', {'business_id': b['id'], 'flagged': !flagged, 'reason': flagged ? null : 'Flagged by admin'});
              } catch (_) {}
              ref.invalidate(adminDataProvider('businesses'));
            },
            child: Text(flagged ? 'Unflag' : 'Flag'),
          ),
        );
      });

  Widget _aiUsage(Map<String, dynamic> d) {
    final days = Map<String, dynamic>.from(d['by_day'] as Map? ?? {}).entries.toList()..sort((a, b) => b.key.compareTo(a.key));
    return ListView(children: [
      for (final e in days)
        ListTile(
          title: Text(e.key),
          subtitle: Text('${e.value['requests']} requests · ${e.value['llm']} LLM · ${e.value['errors']} errors'),
          trailing: Text('${e.value['tokens']} tokens'),
        ),
    ]);
  }

  Widget _support(Map<String, dynamic> d) => _list(d['requests'] as List, (r) => ListTile(
        leading: const Icon(Icons.support_agent_rounded),
        title: Text('[${r['kind']}] ${r['subject']}'),
        subtitle: Text('${r['message']}', maxLines: 3, overflow: TextOverflow.ellipsis),
        trailing: DropdownButton<String>(
          value: r['status'] as String,
          items: const [
            DropdownMenuItem(value: 'open', child: Text('Open')),
            DropdownMenuItem(value: 'in_progress', child: Text('In progress')),
            DropdownMenuItem(value: 'resolved', child: Text('Resolved')),
            DropdownMenuItem(value: 'closed', child: Text('Closed')),
          ],
          onChanged: (v) async {
            try {
              await adminAction(ref.read(supabaseClientProvider)!, 'update_support', {'id': r['id'], 'status': v});
            } catch (_) {}
            ref.invalidate(adminDataProvider('support'));
          },
        ),
      ));

  Widget _list(List items, Widget Function(Map) row) => items.isEmpty
      ? const EmptyState(icon: Icons.inbox_outlined, title: 'Nothing here')
      : ListView.separated(
          itemCount: items.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (_, i) => row(items[i] as Map),
        );
}
