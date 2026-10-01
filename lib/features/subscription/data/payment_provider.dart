import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../domain/plan.dart';

/// Abstraction over how a subscription is purchased. BusinessPilot never
/// handles or stores card data: providers collect payment, then notify the
/// subscription-webhook Edge Function, which updates `subscriptions`.
abstract class PaymentProvider {
  String get id;
  String get label;
  bool get isAvailable;

  /// Starts the purchase flow. Completion is confirmed server-side by webhook.
  Future<PurchaseOutcome> purchase(Plan plan, {required String businessId});

  Future<void> manageSubscription();
}

enum PurchaseOutcome { started, unavailable, cancelled }

/// Android: Google Play Billing (required by Play policy for digital goods).
class GooglePlayBillingProvider implements PaymentProvider {
  @override
  String get id => 'google_play';
  @override
  String get label => 'Google Play';
  @override
  bool get isAvailable => !kIsWeb && defaultTargetPlatform == TargetPlatform.android && _enabled;

  // TODO(google-play-billing): add the `in_app_purchase` plugin, query
  // plan.googlePlayProductId, launch the billing flow with
  // obfuscatedAccountId = businessId, and let the RTDN webhook verify & activate.
  static const _enabled = bool.fromEnvironment('GOOGLE_PLAY_BILLING_ENABLED');

  @override
  Future<PurchaseOutcome> purchase(Plan plan, {required String businessId}) async => PurchaseOutcome.unavailable;

  @override
  Future<void> manageSubscription() =>
      launchUrl(Uri.parse('https://play.google.com/store/account/subscriptions'), mode: LaunchMode.externalApplication);
}

/// Web: hosted checkout (Stripe Checkout or a local provider's hosted page).
class HostedCheckoutProvider implements PaymentProvider {
  @override
  String get id => 'stripe';
  @override
  String get label => 'Card (secure checkout)';
  static const _checkoutBase = String.fromEnvironment('CHECKOUT_URL');
  @override
  bool get isAvailable => kIsWeb && _checkoutBase.isNotEmpty;

  // TODO(stripe): replace with an Edge Function that creates a Checkout Session
  // with metadata.business_id and returns its URL.
  @override
  Future<PurchaseOutcome> purchase(Plan plan, {required String businessId}) async {
    final ok = await launchUrl(Uri.parse('$_checkoutBase?plan=${plan.id}&business=$businessId'));
    return ok ? PurchaseOutcome.started : PurchaseOutcome.cancelled;
  }

  @override
  Future<void> manageSubscription() => launchUrl(Uri.parse('$_checkoutBase/portal'));
}

/// Fallback: talk to sales / local payment providers (Easypaisa, bank transfer...).
class ContactSalesProvider implements PaymentProvider {
  @override
  String get id => 'manual';
  @override
  String get label => 'Contact us to upgrade';
  @override
  bool get isAvailable => true;

  @override
  Future<PurchaseOutcome> purchase(Plan plan, {required String businessId}) async {
    final ok = await launchUrl(
      Uri(
        scheme: 'mailto',
        path: Env.supportEmail,
        queryParameters: {'subject': 'Upgrade to ${plan.name}', 'body': 'Business ID: $businessId'},
      ),
    );
    return ok ? PurchaseOutcome.started : PurchaseOutcome.cancelled;
  }

  @override
  Future<void> manageSubscription() => launchUrl(Uri(scheme: 'mailto', path: Env.supportEmail));
}

/// Picks the right provider for the platform.
class SubscriptionService {
  SubscriptionService([List<PaymentProvider>? providers])
    : providers = providers ?? [GooglePlayBillingProvider(), HostedCheckoutProvider(), ContactSalesProvider()];
  final List<PaymentProvider> providers;

  PaymentProvider get preferred => providers.firstWhere((p) => p.isAvailable);
}
