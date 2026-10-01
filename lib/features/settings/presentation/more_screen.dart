import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/responsive_scaffold.dart';

/// Mobile "More" tab: everything not in the bottom bar.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final items = <(IconData, String, String)>[
      (Icons.sell_outlined, l.navProducts, '/products'),
      (Icons.people_outline_rounded, l.navCustomers, '/customers'),
      (Icons.local_shipping_outlined, l.navSuppliers, '/suppliers'),
      (Icons.payments_outlined, l.navExpenses, '/expenses'),
      (Icons.insights_outlined, l.navReports, '/reports'),
      (Icons.notifications_none_rounded, l.navNotifications, '/notifications'),
      (Icons.search_rounded, l.navSearch, '/search'),
      (Icons.workspace_premium_outlined, 'Plan & billing', '/subscription'),
      (Icons.settings_outlined, l.navSettings, '/settings'),
      (Icons.help_outline_rounded, l.navHelp, '/help'),
    ];
    return Scaffold(
      appBar: AppBar(title: const BusinessSwitcher()),
      body: ListView(children: [
        for (final (icon, label, path) in items)
          ListTile(leading: Icon(icon), title: Text(label), trailing: const Icon(Icons.chevron_right_rounded), onTap: () => context.push(path)),
      ]),
    );
  }
}
