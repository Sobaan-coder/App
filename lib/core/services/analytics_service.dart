import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supabase_service.dart';

/// Product analytics, privacy-first: event names + coarse properties only
/// (never amounts, names or free text). Swap the implementation to integrate
/// a provider (PostHog, Mixpanel, Firebase) later.
abstract class AnalyticsService {
  Future<void> track(String event, {String? businessId, Map<String, Object?> properties = const {}});
}

class SupabaseAnalytics implements AnalyticsService {
  SupabaseAnalytics(this._client);
  final SupabaseClient _client;

  static const allowedEvents = {
    'signup',
    'business_created',
    'product_created',
    'transaction_created',
    'ai_request',
    'report_generated',
    'invoice_created',
    'subscription_started',
    'subscription_cancelled',
    'onboarding_completed',
    'demo_opened',
  };

  @override
  Future<void> track(String event, {String? businessId, Map<String, Object?> properties = const {}}) async {
    assert(allowedEvents.contains(event), 'Unknown analytics event $event');
    final uid = _client.auth.currentUser?.id;
    if (uid == null) return;
    try {
      await _client.from('analytics_events').insert({
        'event': event,
        'user_id': uid,
        'business_id': ?businessId,
        'properties': properties,
      });
    } catch (e) {
      debugPrint('analytics failed: $e');
    }
  }
}

class NoopAnalytics implements AnalyticsService {
  @override
  Future<void> track(String event, {String? businessId, Map<String, Object?> properties = const {}}) async {}
}

final analyticsProvider = Provider<AnalyticsService>((ref) {
  final client = ref.watch(supabaseClientProvider);
  return client == null ? NoopAnalytics() : SupabaseAnalytics(client);
});
