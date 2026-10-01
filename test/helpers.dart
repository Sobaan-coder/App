import 'package:businesspilot/core/config/feature_flags.dart';
import 'package:businesspilot/core/services/connectivity_service.dart';
import 'package:businesspilot/core/theme/app_theme.dart';
import 'package:businesspilot/features/auth/data/auth_repository.dart';
import 'package:businesspilot/features/business/data/business_repository.dart';
import 'package:businesspilot/features/business/domain/business.dart';
import 'package:businesspilot/features/notifications/data/notification_repository.dart';
import 'package:businesspilot/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';

const testBusiness = Business(
  id: 'b1',
  name: 'My Restaurant',
  businessType: 'restaurant',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
);

ActiveBusiness activeAs(MemberRole role) =>
    ActiveBusiness(business: testBusiness, role: role, settings: const BusinessSettings(), flags: FeatureFlags.defaults);

List<Override> baseOverrides({MemberRole role = MemberRole.owner}) => [
  activeBusinessProvider.overrideWith((ref) async => activeAs(role)),
  businessProvider.overrideWithValue(activeAs(role)),
  membershipsProvider.overrideWith((ref) async => [Membership(testBusiness, role)]),
  notificationsProvider.overrideWith((ref) async => const []),
  connectivityProvider.overrideWith((ref) => Stream.value(true)),
  currentUserProvider.overrideWithValue(null),
];

Future<void> pumpApp(
  WidgetTester tester,
  Widget child, {
  List<Override> overrides = const [],
  Size size = const Size(400, 860),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [...baseOverrides(), ...overrides],
      retry: (_, _) => null,
      child: MaterialApp(
        theme: AppTheme.light(),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: child,
      ),
    ),
  );
  await tester.pumpAndSettle();
}
