import 'package:businesspilot/shared/widgets/responsive_scaffold.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

void main() {
  testWidgets('phone: bottom navigation with AI one tap away', (tester) async {
    await pumpApp(
      tester,
      const ResponsiveScaffold(location: '/', child: Text('content')),
      size: const Size(400, 860),
    );
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('AI'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    expect(find.text('content'), findsOneWidget);
  });

  testWidgets('desktop: sidebar with all sections, no bottom bar', (tester) async {
    await pumpApp(
      tester,
      const ResponsiveScaffold(location: '/reports', child: Text('content')),
      size: const Size(1400, 900),
    );
    expect(find.byType(NavigationBar), findsNothing);
    for (final label in [
      'Dashboard',
      'AI Assistant',
      'Transactions',
      'Products',
      'Inventory',
      'Customers',
      'Suppliers',
      'Expenses',
      'Reports',
      'Settings',
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('My Restaurant'), findsOneWidget); // business switcher in top bar
  });

  testWidgets('tablet: collapsible rail', (tester) async {
    await pumpApp(
      tester,
      const ResponsiveScaffold(location: '/', child: Text('content')),
      size: const Size(900, 900),
    );
    expect(find.text('Reports'), findsNothing); // collapsed: icons only
    await tester.tap(find.byTooltip('Expand menu'));
    await tester.pumpAndSettle();
    expect(find.text('Reports'), findsOneWidget);
  });
}
