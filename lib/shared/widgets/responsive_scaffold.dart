import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/l10n_x.dart';
import '../../features/business/data/business_repository.dart';
import '../../features/notifications/data/notification_repository.dart';
import 'brand_logo.dart';
import 'offline_banner.dart';

class Breakpoints {
  static const compact = 700.0;
  static const expanded = 1100.0;
  static bool isCompact(BuildContext c) => MediaQuery.sizeOf(c).width < compact;
  static bool isExpanded(BuildContext c) => MediaQuery.sizeOf(c).width >= expanded;
}

class NavItem {
  const NavItem(this.path, this.icon, this.selectedIcon, this.label);
  final String path;
  final IconData icon;
  final IconData selectedIcon;
  final String Function(BuildContext) label;
}

List<NavItem> sidebarItems() => [
  NavItem('/', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, (c) => c.l10n.navDashboard),
  NavItem('/ai', Icons.auto_awesome_outlined, Icons.auto_awesome_rounded, (c) => c.l10n.navAiAssistant),
  NavItem('/transactions', Icons.receipt_long_outlined, Icons.receipt_long_rounded, (c) => c.l10n.navTransactions),
  NavItem('/products', Icons.sell_outlined, Icons.sell_rounded, (c) => c.l10n.navProducts),
  NavItem('/inventory', Icons.inventory_2_outlined, Icons.inventory_2_rounded, (c) => c.l10n.navInventory),
  NavItem('/customers', Icons.people_outline_rounded, Icons.people_rounded, (c) => c.l10n.navCustomers),
  NavItem('/suppliers', Icons.local_shipping_outlined, Icons.local_shipping_rounded, (c) => c.l10n.navSuppliers),
  NavItem('/expenses', Icons.payments_outlined, Icons.payments_rounded, (c) => c.l10n.navExpenses),
  NavItem('/reports', Icons.insights_outlined, Icons.insights_rounded, (c) => c.l10n.navReports),
  NavItem('/settings', Icons.settings_outlined, Icons.settings_rounded, (c) => c.l10n.navSettings),
];

List<NavItem> bottomItems() => [
  NavItem('/', Icons.home_outlined, Icons.home_rounded, (c) => c.l10n.navHome),
  NavItem('/transactions', Icons.receipt_long_outlined, Icons.receipt_long_rounded, (c) => c.l10n.navTransactions),
  NavItem('/ai', Icons.auto_awesome_outlined, Icons.auto_awesome_rounded, (c) => c.l10n.navAi),
  NavItem('/inventory', Icons.inventory_2_outlined, Icons.inventory_2_rounded, (c) => c.l10n.navInventory),
  NavItem('/more', Icons.menu_rounded, Icons.menu_rounded, (c) => c.l10n.navMore),
];

int _indexFor(List<NavItem> items, String location) {
  var best = -1;
  var bestLen = -1;
  for (var i = 0; i < items.length; i++) {
    final p = items[i].path;
    final match = p == '/' ? location == '/' : (location == p || location.startsWith('$p/'));
    if (match && p.length > bestLen) {
      best = i;
      bestLen = p.length;
    }
  }
  return best;
}

/// Desktop: sidebar + content. Tablet: collapsible rail. Mobile: bottom navigation.
class ResponsiveScaffold extends ConsumerStatefulWidget {
  const ResponsiveScaffold({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  ConsumerState<ResponsiveScaffold> createState() => _ResponsiveScaffoldState();
}

class _ResponsiveScaffoldState extends ConsumerState<ResponsiveScaffold> {
  bool _railExtended = false;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width < Breakpoints.compact) return _mobile(context);
    final expanded = width >= Breakpoints.expanded;
    final items = sidebarItems();
    final selected = _indexFor(items, widget.location);
    final showLabels = expanded || _railExtended;
    return Scaffold(
      body: Row(
        children: [
          _Sidebar(
            items: items,
            selected: selected,
            extended: showLabels,
            onToggle: expanded ? null : () => setState(() => _railExtended = !_railExtended),
            onSelect: (i) => context.go(items[i].path),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: Column(
              children: [
                const _TopBar(),
                const OfflineBanner(),
                Expanded(child: widget.child),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _mobile(BuildContext context) {
    final items = bottomItems();
    var selected = _indexFor(items, widget.location);
    if (selected < 0) selected = 4; // sections reached via "More"
    return Scaffold(
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: widget.child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected,
        onDestinationSelected: (i) => context.go(items[i].path),
        destinations: [
          for (final it in items)
            NavigationDestination(
              icon: it.path == '/ai' ? _AiNavIcon(selected: false, icon: it.icon) : Icon(it.icon),
              selectedIcon: it.path == '/ai' ? _AiNavIcon(selected: true, icon: it.selectedIcon) : Icon(it.selectedIcon),
              label: it.label(context),
              tooltip: it.label(context),
            ),
        ],
      ),
    );
  }
}

/// The AI tab is emphasised: one tap from anywhere.
class _AiNavIcon extends StatelessWidget {
  const _AiNavIcon({required this.selected, required this.icon});
  final bool selected;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: selected ? scheme.primary : scheme.primary.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: selected ? scheme.onPrimary : scheme.primary, size: 22),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.items, required this.selected, required this.extended, required this.onSelect, this.onToggle});
  final List<NavItem> items;
  final int selected;
  final bool extended;
  final ValueChanged<int> onSelect;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: extended ? 248 : 84,
      color: t.colorScheme.surface,
      // Labels only render once there is room for them (no overflow mid-animation).
      child: LayoutBuilder(builder: (context, box) => _content(context, t, extended && box.maxWidth >= 200)),
    );
  }

  Widget _content(BuildContext context, ThemeData t, bool extended) {
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
            child: BrandLogo(size: 34, showText: extended),
          ),
          if (onToggle != null)
            IconButton(
              tooltip: extended ? 'Collapse menu' : 'Expand menu',
              onPressed: onToggle,
              icon: Icon(extended ? Icons.chevron_left_rounded : Icons.chevron_right_rounded),
            ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (var i = 0; i < items.length; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Tooltip(
                      message: extended ? '' : items[i].label(context),
                      child: Material(
                        color: i == selected ? t.colorScheme.primary.withValues(alpha: 0.12) : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => onSelect(i),
                          child: Semantics(
                            selected: i == selected,
                            button: true,
                            label: items[i].label(context),
                            excludeSemantics: true,
                            child: Container(
                              height: 48,
                              padding: const EdgeInsets.symmetric(horizontal: 14),
                              alignment: extended ? AlignmentDirectional.centerStart : Alignment.center,
                              child: Row(
                                mainAxisSize: extended ? MainAxisSize.max : MainAxisSize.min,
                                children: [
                                  Icon(
                                    i == selected ? items[i].selectedIcon : items[i].icon,
                                    color: i == selected ? t.colorScheme.primary : t.colorScheme.onSurfaceVariant,
                                  ),
                                  if (extended) ...[
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Text(
                                        items[i].label(context),
                                        overflow: TextOverflow.ellipsis,
                                        style: t.textTheme.labelLarge?.copyWith(
                                          color: i == selected ? t.colorScheme.primary : t.colorScheme.onSurface,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (extended)
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: () => context.go('/transactions/new'),
                icon: const Icon(Icons.add_rounded),
                label: Text(context.l10n.recordTransaction),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.all(12),
              child: IconButton.filled(
                tooltip: context.l10n.recordTransaction,
                onPressed: () => context.go('/transactions/new'),
                icon: const Icon(Icons.add_rounded),
              ),
            ),
        ],
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
      child: const Row(children: [BusinessSwitcher(), Spacer(), ShellActions(force: true)]),
    );
  }
}

/// Search + notifications. On wide layouts these live in the shell top bar, so
/// screens only render them when compact (pass force for the shell itself).
class ShellActions extends ConsumerWidget {
  const ShellActions({super.key, this.force = false});
  final bool force;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!force && !Breakpoints.isCompact(context)) return const SizedBox.shrink();
    final unread = ref.watch(unreadCountProvider);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: context.l10n.navSearch,
          icon: const Icon(Icons.search_rounded),
          onPressed: () => context.push('/search'),
        ),
        IconButton(
          tooltip: unread > 0 ? '${context.l10n.navNotifications} ($unread unread)' : context.l10n.navNotifications,
          onPressed: () => context.push('/notifications'),
          icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.notifications_none_rounded)),
        ),
      ],
    );
  }
}

class BusinessSwitcher extends ConsumerWidget {
  const BusinessSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(activeBusinessProvider).value;
    final memberships = ref.watch(membershipsProvider).value ?? const [];
    if (active == null) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      tooltip: 'Switch business',
      onSelected: (id) {
        if (id == '__new') {
          context.go('/onboarding?new=1');
        } else {
          ref.read(currentBusinessIdProvider.notifier).select(id);
        }
      },
      itemBuilder: (_) => [
        for (final m in memberships)
          PopupMenuItem(
            value: m.business.id,
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(m.business.id == active.id ? Icons.radio_button_checked : Icons.radio_button_off),
              title: Text(m.business.name),
              subtitle: Text('${m.role.label}${m.business.isDemo ? ' · Demo' : ''}'),
            ),
          ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: '__new',
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.add_business_rounded),
            title: Text('Add a business'),
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 220),
              child: Text(active.business.name, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
            ),
            if (active.business.isDemo) ...[
              const SizedBox(width: 8),
              const Chip(label: Text('Demo'), visualDensity: VisualDensity.compact),
            ],
            const Icon(Icons.expand_more_rounded),
          ],
        ),
      ),
    );
  }
}
