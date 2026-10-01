import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/presentation/admin_screen.dart';
import '../../features/ai_assistant/presentation/ai_assistant_screen.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/password_screens.dart';
import '../../features/auth/presentation/signup_screen.dart';
import '../../features/business/data/business_repository.dart';
import '../../features/customers/domain/contact.dart';
import '../../features/customers/presentation/contact_detail_screen.dart';
import '../../features/customers/presentation/contacts_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/expenses/presentation/expenses_screen.dart';
import '../../features/import_export/presentation/import_export_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/products/presentation/product_form_screen.dart';
import '../../features/products/presentation/products_screen.dart';
import '../../features/reports/presentation/reports_screen.dart';
import '../../features/search/presentation/search_screen.dart';
import '../../features/settings/presentation/more_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/settings/presentation/team_screen.dart';
import '../../features/subscription/presentation/subscription_screen.dart';
import '../../features/support/presentation/help_center_screen.dart';
import '../../features/suppliers/presentation/suppliers_screen.dart';
import '../../features/transactions/domain/transaction.dart';
import '../../features/transactions/presentation/transaction_detail_screen.dart';
import '../../features/transactions/presentation/transaction_form_screen.dart';
import '../../features/transactions/presentation/transactions_screen.dart';
import '../../shared/widgets/responsive_scaffold.dart';
import '../../shared/widgets/states.dart';
import '../config/env.dart';
import 'startup_screens.dart';

const _authRoutes = {'/login', '/signup', '/forgot-password'};

/// Re-evaluates redirects whenever auth state or memberships change.
class RouterRefresh extends ChangeNotifier {
  RouterRefresh(this._ref) {
    _ref.listen(authStateProvider, (_, _) => notifyListeners());
    _ref.listen(passwordRecoveryProvider, (_, _) => notifyListeners());
    _ref.listen(membershipsProvider, (_, _) => notifyListeners());
  }
  final Ref _ref;

  String? redirect(GoRouterState s) {
    final loc = s.matchedLocation;
    if (!Env.isConfigured) return loc == '/setup' ? null : '/setup';
    if (loc == '/setup') return '/';
    final user = _ref.read(currentUserProvider);
    if (_ref.read(passwordRecoveryProvider)) return loc == '/reset-password' ? null : '/reset-password';
    if (user == null) return _authRoutes.contains(loc) ? null : '/login';
    if (_authRoutes.contains(loc) || loc == '/reset-password') return '/';
    if (loc == '/admin') return null;

    final memberships = _ref.read(membershipsProvider);
    if (!memberships.hasValue) {
      return loc == '/loading' ? null : Uri(path: '/loading', queryParameters: {'from': s.uri.toString()}).toString();
    }
    if (memberships.value!.isEmpty) return loc == '/onboarding' ? null : '/onboarding';
    if (loc == '/loading') return s.uri.queryParameters['from'] ?? '/';
    return null;
  }
}

final Provider<GoRouter> routerProvider = Provider<GoRouter>((ref) {
  final refresh = RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  GoRoute page(String path, Widget Function(GoRouterState s) build) => GoRoute(
    path: path,
    pageBuilder: (context, s) => NoTransitionPage(key: s.pageKey, child: build(s)),
  );

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (_, s) => refresh.redirect(s),
    errorBuilder: (context, _) => Scaffold(
      appBar: AppBar(),
      body: EmptyState(
        icon: Icons.explore_off_rounded,
        title: 'Page not found',
        actionLabel: 'Go home',
        onAction: () => GoRouter.of(context).go('/'),
      ),
    ),
    routes: [
      GoRoute(path: '/setup', builder: (_, _) => const SetupRequiredScreen()),
      GoRoute(path: '/loading', builder: (_, _) => const StartupLoadingScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/signup', builder: (_, _) => const SignupScreen()),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(path: '/reset-password', builder: (_, _) => const ResetPasswordScreen()),
      GoRoute(
        path: '/onboarding',
        builder: (_, s) => OnboardingScreen(addingAnother: s.uri.queryParameters['new'] == '1'),
      ),
      GoRoute(path: '/admin', builder: (_, _) => const AdminScreen()),
      ShellRoute(
        builder: (context, s, child) => AppShell(location: s.matchedLocation, child: child),
        routes: [
          page('/', (_) => const DashboardScreen()),
          page(
            '/ai',
            (s) => AiAssistantScreen(key: ValueKey(s.uri.queryParameters['q']), initialText: s.uri.queryParameters['q']),
          ),
          page('/transactions', (_) => const TransactionsScreen()),
          GoRoute(
            path: '/transactions/new',
            builder: (_, s) => TransactionFormScreen(
              type: TransactionType.fromApi(s.uri.queryParameters['type'] ?? 'sale'),
              customerId: s.uri.queryParameters['customer'],
              supplierId: s.uri.queryParameters['supplier'],
            ),
          ),
          GoRoute(
            path: '/transactions/:id',
            builder: (_, s) => TransactionDetailScreen(id: s.pathParameters['id']!),
          ),
          page('/products', (_) => const ProductsScreen()),
          GoRoute(
            path: '/products/new',
            builder: (_, s) => ProductFormScreen(barcode: s.uri.queryParameters['barcode']),
          ),
          GoRoute(
            path: '/products/:id',
            builder: (_, s) => ProductFormScreen(id: s.pathParameters['id']),
          ),
          page('/inventory', (s) => InventoryScreen(key: ValueKey(s.uri.query), lowOnly: s.uri.queryParameters['low'] == '1')),
          page('/customers', (_) => const ContactsScreen(kind: ContactKind.customer)),
          GoRoute(
            path: '/customers/:id',
            builder: (_, s) => ContactDetailScreen(kind: ContactKind.customer, id: s.pathParameters['id']!),
          ),
          page('/suppliers', (_) => const SuppliersScreen()),
          GoRoute(
            path: '/suppliers/:id',
            builder: (_, s) => ContactDetailScreen(kind: ContactKind.supplier, id: s.pathParameters['id']!),
          ),
          page('/expenses', (_) => const ExpensesScreen()),
          page('/reports', (_) => const ReportsScreen()),
          page('/settings', (_) => const SettingsScreen()),
          GoRoute(path: '/settings/team', builder: (_, _) => const TeamScreen()),
          GoRoute(path: '/settings/import-export', builder: (_, _) => const ImportExportScreen()),
          GoRoute(path: '/subscription', builder: (_, _) => const SubscriptionScreen()),
          GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
          GoRoute(path: '/search', builder: (_, _) => const SearchScreen()),
          GoRoute(path: '/help', builder: (_, _) => const HelpCenterScreen()),
          page('/more', (_) => const MoreScreen()),
        ],
      ),
    ],
  );
});

/// Ensures the active business is loaded before any in-app screen renders.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(activeBusinessProvider);
    return active.when(
      skipLoadingOnRefresh: true,
      skipLoadingOnReload: true,
      loading: () => const Scaffold(body: LoadingState(message: 'Loading your business…')),
      error: (e, _) => Scaffold(
        body: ErrorState(error: e, onRetry: () => ref.invalidate(membershipsProvider)),
      ),
      data: (b) => b == null ? const Scaffold(body: LoadingState()) : ResponsiveScaffold(location: location, child: child),
    );
  }
}
