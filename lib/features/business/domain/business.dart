import '../../../core/config/feature_flags.dart';

enum MemberRole {
  owner('Owner', 50),
  admin('Admin', 40),
  manager('Manager', 30),
  employee('Employee', 20),
  viewer('Viewer', 10);

  const MemberRole(this.label, this.rank);
  final String label;
  final int rank;

  static MemberRole fromApi(String? v) => values.firstWhere((r) => r.name == v, orElse: () => MemberRole.viewer);

  bool atLeast(MemberRole other) => rank >= other.rank;

  // UI permissions mirror the server rules (the server is the authority).
  bool get canRecord => atLeast(employee);
  bool get canEditCatalogue => atLeast(manager);
  bool get canDeleteTransactions => atLeast(manager);
  bool get canEditTransactions => atLeast(manager);
  bool get canManageSettings => atLeast(admin);
  bool get canManageTeam => atLeast(admin);
  bool get canManageBilling => this == owner;
  bool get canExport => atLeast(admin);
  bool get canSeeEmployees => atLeast(manager);

  String get description => switch (this) {
        owner => 'Full access, including billing and deleting the business.',
        admin => 'Manage settings, team members and all records.',
        manager => 'Manage products, prices and edit or delete records.',
        employee => 'Record sales, purchases and expenses.',
        viewer => 'Read-only access to records and reports.',
      };
}

class Business {
  const Business({
    required this.id,
    required this.name,
    required this.businessType,
    required this.currency,
    required this.timezone,
    this.country,
    this.address,
    this.phone,
    this.email,
    this.logoUrl,
    this.taxEnabled = false,
    this.taxRateBp = 0,
    this.invoicePrefix = 'INV-',
    this.isDemo = false,
  });

  final String id;
  final String name;
  final String businessType;
  final String currency;
  final String timezone;
  final String? country;
  final String? address;
  final String? phone;
  final String? email;
  final String? logoUrl;
  final bool taxEnabled;
  final int taxRateBp;
  final String invoicePrefix;
  final bool isDemo;

  factory Business.fromJson(Map<String, dynamic> j) => Business(
        id: j['id'] as String,
        name: j['name'] as String,
        businessType: j['business_type'] as String? ?? 'other',
        currency: j['currency'] as String? ?? 'PKR',
        timezone: j['timezone'] as String? ?? 'UTC',
        country: j['country'] as String?,
        address: j['address'] as String?,
        phone: j['phone'] as String?,
        email: j['email'] as String?,
        logoUrl: j['logo_url'] as String?,
        taxEnabled: j['tax_enabled'] as bool? ?? false,
        taxRateBp: j['tax_rate_bp'] as int? ?? 0,
        invoicePrefix: j['invoice_prefix'] as String? ?? 'INV-',
        isDemo: j['is_demo'] as bool? ?? false,
      );
}

class Membership {
  const Membership(this.business, this.role);
  final Business business;
  final MemberRole role;
}

class BusinessSettings {
  const BusinessSettings({
    this.aiAutoRecordLowRisk = false,
    this.aiConfirmThresholdMinor = 2000000,
    this.lowStockAlerts = true,
    this.dailySummary = true,
    this.monthlyReport = true,
    this.paymentDueReminders = true,
    this.invoiceFooter = 'Thank you for your business!',
    this.featureFlags = const {},
  });

  final bool aiAutoRecordLowRisk;
  final int aiConfirmThresholdMinor;
  final bool lowStockAlerts;
  final bool dailySummary;
  final bool monthlyReport;
  final bool paymentDueReminders;
  final String invoiceFooter;
  final Map<String, dynamic> featureFlags;

  factory BusinessSettings.fromJson(Map<String, dynamic> j) => BusinessSettings(
        aiAutoRecordLowRisk: j['ai_auto_record_low_risk'] as bool? ?? false,
        aiConfirmThresholdMinor: (j['ai_confirm_threshold_minor'] as num?)?.toInt() ?? 2000000,
        lowStockAlerts: j['low_stock_alerts'] as bool? ?? true,
        dailySummary: j['daily_summary'] as bool? ?? true,
        monthlyReport: j['monthly_report'] as bool? ?? true,
        paymentDueReminders: j['payment_due_reminders'] as bool? ?? true,
        invoiceFooter: j['invoice_footer'] as String? ?? '',
        featureFlags: Map<String, dynamic>.from(j['feature_flags'] as Map? ?? const {}),
      );
}

/// Everything screens need to know about the business currently in use.
class ActiveBusiness {
  const ActiveBusiness({required this.business, required this.role, required this.settings, required this.flags});
  final Business business;
  final MemberRole role;
  final BusinessSettings settings;
  final FeatureFlags flags;

  String get id => business.id;
  String get currency => business.currency;
}
