import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../domain/plan.dart';
import 'payment_provider.dart';

final plansProvider = FutureProvider<List<Plan>>((ref) async {
  try {
    final rows = await ref.supabase.from('plans').select().eq('is_active', true).order('sort_order');
    return rows.map(Plan.fromJson).toList();
  } catch (e) {
    throw AppFailure.from(e);
  }
});

final planUsageProvider = FutureProvider.autoDispose<PlanUsage>((ref) async {
  ref.watch(dataVersionProvider);
  final b = ref.watch(businessProvider);
  try {
    final j = await ref.supabase.rpc('plan_usage', params: {'p_business_id': b.id});
    return PlanUsage.fromJson(Map<String, dynamic>.from(j as Map));
  } catch (e) {
    throw AppFailure.from(e);
  }
});

final subscriptionServiceProvider = Provider<SubscriptionService>((ref) => SubscriptionService());
