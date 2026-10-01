import '../../../core/utils/money.dart';

/// A subscription plan. Prices & limits come from the `plans` table — the
/// single source of truth — never from constants in the app.
class Plan {
  const Plan({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.features,
    this.maxTransactionsPerMonth,
    this.maxProducts,
    this.maxUsers,
    this.aiRequestsPerMonth,
    this.googlePlayProductId,
  });

  final String id;
  final String name;
  final String description;
  final Money price;
  final int? maxTransactionsPerMonth;
  final int? maxProducts;
  final int? maxUsers;
  final int? aiRequestsPerMonth;
  final Map<String, dynamic> features;
  final String? googlePlayProductId;

  bool get isFree => price.minor == 0;
  bool feature(String key) => features[key] == true || (features[key] is String && features[key] != 'none');

  factory Plan.fromJson(Map<String, dynamic> j) => Plan(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String? ?? '',
        price: Money((j['price_monthly_minor'] as num?)?.toInt() ?? 0, j['price_currency'] as String? ?? 'USD'),
        maxTransactionsPerMonth: (j['max_transactions_per_month'] as num?)?.toInt(),
        maxProducts: (j['max_products'] as num?)?.toInt(),
        maxUsers: (j['max_users'] as num?)?.toInt(),
        aiRequestsPerMonth: (j['ai_requests_per_month'] as num?)?.toInt(),
        features: Map<String, dynamic>.from(j['features'] as Map? ?? const {}),
        googlePlayProductId: j['google_play_product_id'] as String?,
      );

  List<String> get highlights => [
        maxTransactionsPerMonth == null ? 'Unlimited transactions' : '$maxTransactionsPerMonth transactions / month',
        maxProducts == null ? 'Unlimited products' : 'Up to $maxProducts products',
        maxUsers == null ? 'Unlimited team members' : (maxUsers == 1 ? '1 user' : 'Up to $maxUsers users'),
        if (aiRequestsPerMonth != null) '$aiRequestsPerMonth AI requests / month',
        if (feature('pdf_invoices')) 'PDF invoices',
        if (features['reports'] == 'advanced') 'Advanced reports' else if (features['reports'] == 'full') 'Full reports' else 'Basic reports',
        if (feature('multi_branch')) 'Multiple branches',
        if (feature('api_access')) 'API access',
      ];
}

class PlanUsage {
  const PlanUsage({
    required this.plan,
    required this.status,
    required this.transactionsThisMonth,
    required this.products,
    required this.users,
    required this.aiRequestsThisMonth,
    this.currentPeriodEnd,
    this.cancelAtPeriodEnd = false,
    this.provider,
  });

  final Plan plan;
  final String status;
  final int transactionsThisMonth;
  final int products;
  final int users;
  final int aiRequestsThisMonth;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final String? provider;

  factory PlanUsage.fromJson(Map<String, dynamic> j) {
    final sub = j['subscription'] is Map ? Map<String, dynamic>.from(j['subscription'] as Map) : const <String, dynamic>{};
    return PlanUsage(
      plan: Plan.fromJson(Map<String, dynamic>.from(j['plan'] as Map)),
      status: sub['status'] as String? ?? 'active',
      transactionsThisMonth: (j['transactions_this_month'] as num?)?.toInt() ?? 0,
      products: (j['products'] as num?)?.toInt() ?? 0,
      users: (j['users'] as num?)?.toInt() ?? 0,
      aiRequestsThisMonth: (j['ai_requests_this_month'] as num?)?.toInt() ?? 0,
      currentPeriodEnd: sub['current_period_end'] == null ? null : DateTime.parse(sub['current_period_end'] as String),
      cancelAtPeriodEnd: sub['cancel_at_period_end'] == true,
      provider: sub['provider'] as String?,
    );
  }

  /// Fraction used (0..1) or null when unlimited.
  double? ratio(int used, int? limit) => limit == null || limit == 0 ? null : (used / limit).clamp(0, 1).toDouble();
}
