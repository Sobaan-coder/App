import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/config/feature_flags.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/services/local_store.dart';
import '../../../core/services/supabase_service.dart';
import '../../auth/data/auth_repository.dart';
import '../../products/domain/product.dart';
import '../domain/business.dart';

class BusinessRepository {
  BusinessRepository(this._client);
  final SupabaseClient _client;

  Future<List<Membership>> memberships() async {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) return [];
    try {
      final rows = await _client
          .from('business_members')
          .select('role, business:businesses(*)')
          .eq('user_id', uid)
          .order('created_at');
      return rows
          .where((r) => r['business'] != null)
          .map((r) => Membership(Business.fromJson(Map<String, dynamic>.from(r['business'] as Map)),
              MemberRole.fromApi(r['role'] as String?)))
          .toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<String> createBusiness({required String name, required String type, required String currency, required String timezone}) async {
    try {
      final id = await _client.rpc('create_business', params: {
        'p_name': name, 'p_business_type': type, 'p_currency': currency, 'p_timezone': timezone,
      });
      return id as String;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<String> createDemoBusiness() async {
    try {
      return await _client.rpc('create_demo_business') as String;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<BusinessSettings> settings(String businessId) async {
    final row = await _client.from('business_settings').select().eq('business_id', businessId).maybeSingle();
    return row == null ? const BusinessSettings() : BusinessSettings.fromJson(row);
  }

  Future<Map<String, dynamic>> globalFlags() async {
    try {
      final row = await _client.from('settings').select('value').eq('key', 'feature_flags').maybeSingle();
      return Map<String, dynamic>.from((row?['value'] as Map?) ?? const {});
    } catch (_) {
      return const {};
    }
  }

  Future<void> updateBusiness(String id, Map<String, dynamic> fields) async {
    try {
      await _client.from('businesses').update(fields).eq('id', id);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> updateSettings(String businessId, Map<String, dynamic> fields) async {
    try {
      await _client.from('business_settings').update(fields).eq('business_id', businessId);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> setOpeningCash(String businessId, int minor) async {
    try {
      await _client.from('accounts').update({'opening_balance_minor': minor})
          .eq('business_id', businessId).eq('type', 'cash').eq('is_default', true);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<Map<String, dynamic>> exportData(String businessId) async {
    try {
      return Map<String, dynamic>.from(await _client.rpc('export_business_data', params: {'p_business_id': businessId}) as Map);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> deleteBusiness(String businessId) async {
    try {
      await _client.rpc('soft_delete_business', params: {'p_business_id': businessId});
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final businessRepositoryProvider = Provider<BusinessRepository>((ref) => BusinessRepository(ref.supabase));

/// All businesses the signed-in user belongs to (role comes from the server).
final membershipsProvider = FutureProvider<List<Membership>>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) return [];
  return ref.read(businessRepositoryProvider).memberships();
});

/// The business the user is working in, persisted per device.
class CurrentBusinessIdController extends Notifier<String?> {
  static const _key = 'bp_business_id';
  @override
  String? build() => ref.watch(keyValueStoreProvider).getString(_key);

  Future<void> select(String id) async {
    state = id;
    await ref.read(keyValueStoreProvider).setString(_key, id);
  }
}

final currentBusinessIdProvider = NotifierProvider<CurrentBusinessIdController, String?>(CurrentBusinessIdController.new);

final activeBusinessProvider = FutureProvider<ActiveBusiness?>((ref) async {
  final memberships = await ref.watch(membershipsProvider.future);
  if (memberships.isEmpty) return null;
  final selected = ref.watch(currentBusinessIdProvider);
  final m = memberships.where((m) => m.business.id == selected).firstOrNull ??
      memberships.where((m) => !m.business.isDemo).firstOrNull ??
      memberships.first;
  final repo = ref.read(businessRepositoryProvider);
  final results = await Future.wait([repo.settings(m.business.id), repo.globalFlags()]);
  final settings = results[0] as BusinessSettings;
  final flags = FeatureFlags.defaults.merge(results[1] as Map<String, dynamic>).merge(settings.featureFlags);
  return ActiveBusiness(business: m.business, role: m.role, settings: settings, flags: flags);
});

/// Synchronous access for screens rendered inside the app shell (which only
/// builds once the active business has loaded).
final businessProvider = Provider<ActiveBusiness>((ref) {
  final b = ref.watch(activeBusinessProvider).value;
  if (b == null) throw StateError('No active business');
  return b;
});

extension OnboardingProduct on BusinessRepository {
  /// Used during onboarding before the business becomes the active one.
  Future<void> createFirstProduct(String businessId, Product p, double openingStock) async {
    try {
      final row = await _client.from('products').insert({...p.toWritableJson(), 'business_id': businessId}).select('id').single();
      if (openingStock > 0) {
        await _client.rpc('adjust_inventory', params: {
          'p_product_id': row['id'], 'p_type': 'opening', 'p_quantity_change': openingStock, 'p_note': 'Opening stock',
        });
      }
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}
