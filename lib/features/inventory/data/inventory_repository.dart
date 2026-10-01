import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../domain/inventory_movement.dart';

class InventoryRepository {
  InventoryRepository(this._ref, this._client);
  final Ref _ref;
  final SupabaseClient _client;

  /// Every stock change goes through adjust_inventory(), which records why.
  Future<double> adjust(String productId, MovementType type, double change, {String? note}) async {
    try {
      final v = await _client.rpc(
        'adjust_inventory',
        params: {'p_product_id': productId, 'p_type': type.api, 'p_quantity_change': change, 'p_note': note},
      );
      _ref.read(dataVersionProvider.notifier).bump();
      return (v as num).toDouble();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<List<InventoryMovement>> history(String productId) async {
    try {
      final rows = await _client
          .from('inventory_transactions')
          .select('id, type, quantity_change, created_at, note')
          .eq('product_id', productId)
          .order('created_at', ascending: false)
          .limit(100);
      return rows.map(InventoryMovement.fromJson).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  ref.watch(businessProvider);
  return InventoryRepository(ref, ref.supabase);
});

final inventoryHistoryProvider = FutureProvider.autoDispose.family<List<InventoryMovement>, String>((ref, productId) async {
  ref.watch(dataVersionProvider);
  return ref.watch(inventoryRepositoryProvider).history(productId);
});
