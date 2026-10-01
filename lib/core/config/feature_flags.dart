/// Feature flags: defaults < global flags (settings table) < per-business overrides.
class FeatureFlags {
  const FeatureFlags({
    this.aiEnabled = true,
    this.barcodeEnabled = true,
    this.receiptScanning = false,
    this.subscriptionsEnabled = true,
    this.multiBranch = false,
  });

  final bool aiEnabled;
  final bool barcodeEnabled;
  final bool receiptScanning;
  final bool subscriptionsEnabled;
  final bool multiBranch;

  static const defaults = FeatureFlags();

  FeatureFlags merge(Map<String, dynamic>? json) {
    if (json == null) return this;
    bool pick(String key, bool current) => json[key] is bool ? json[key] as bool : current;
    return FeatureFlags(
      aiEnabled: pick('ai_enabled', aiEnabled),
      barcodeEnabled: pick('barcode_enabled', barcodeEnabled),
      receiptScanning: pick('receipt_scanning', receiptScanning),
      subscriptionsEnabled: pick('subscriptions_enabled', subscriptionsEnabled),
      multiBranch: pick('multi_branch', multiBranch),
    );
  }
}
