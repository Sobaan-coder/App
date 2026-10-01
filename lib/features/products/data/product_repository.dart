import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../domain/product.dart';

class ProductRepository {
  ProductRepository(this._ref, this._client, this._businessId, this._currency);
  final Ref _ref;
  final SupabaseClient _client;
  final String _businessId;
  final String _currency;

  static const _columns =
      'id, business_id, category_id, name, sku, description, selling_price_minor, cost_price_minor, stock_quantity, '
      'minimum_stock, unit, barcode, image_url, track_inventory, is_active';

  Future<List<Product>> list({String? search, bool activeOnly = false}) async {
    try {
      var q = _client.from('products').select(_columns).eq('business_id', _businessId).isFilter('deleted_at', null);
      if (activeOnly) q = q.eq('is_active', true);
      if (search != null && search.trim().length >= 2) {
        final s = search.trim().replaceAll(RegExp(r'[%_,()]'), '');
        q = q.or('name.ilike.%$s%,sku.ilike.%$s%,barcode.eq.$s');
      }
      final rows = await q.order('name').limit(500);
      return rows.map((r) => Product.fromJson(r, _currency)).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<Product?> byBarcode(String code) async {
    final rows = await _client.from('products').select(_columns)
        .eq('business_id', _businessId).eq('barcode', code.trim()).isFilter('deleted_at', null).limit(1);
    return rows.isEmpty ? null : Product.fromJson(rows.first, _currency);
  }

  Future<Product> get(String id) async {
    try {
      return Product.fromJson(await _client.from('products').select(_columns).eq('id', id).single(), _currency);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// Creates a product. Opening stock is recorded as an inventory movement
  /// (stock is never set directly).
  Future<String> create(Product p, {double openingStock = 0}) async {
    try {
      final row = await _client.from('products').insert({...p.toWritableJson(), 'business_id': _businessId}).select('id').single();
      final id = row['id'] as String;
      if (openingStock != 0) {
        await _client.rpc('adjust_inventory', params: {
          'p_product_id': id, 'p_type': 'opening', 'p_quantity_change': openingStock, 'p_note': 'Opening stock',
        });
      }
      _ref.read(dataVersionProvider.notifier).bump();
      return id;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> update(String id, Map<String, dynamic> fields) async {
    try {
      await _client.from('products').update(fields).eq('id', id);
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> archive(String id) => update(id, {'deleted_at': DateTime.now().toUtc().toIso8601String()});

  Future<List<ProductCategory>> categories() async {
    final rows = await _client.from('product_categories').select('id, name').eq('business_id', _businessId).order('name');
    return rows.map((r) => ProductCategory(r['id'] as String, r['name'] as String)).toList();
  }

  Future<String> addCategory(String name) async {
    try {
      final row = await _client.from('product_categories')
          .insert({'business_id': _businessId, 'name': name.trim()}).select('id').single();
      return row['id'] as String;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  final b = ref.watch(businessProvider);
  return ProductRepository(ref, ref.supabase, b.id, b.currency);
});

final productsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  ref.watch(dataVersionProvider);
  return ref.watch(productRepositoryProvider).list();
});

final productProvider = FutureProvider.autoDispose.family<Product, String>((ref, id) async {
  ref.watch(dataVersionProvider);
  return ref.watch(productRepositoryProvider).get(id);
});

final productCategoriesProvider = FutureProvider.autoDispose<List<ProductCategory>>((ref) async {
  ref.watch(dataVersionProvider);
  return ref.watch(productRepositoryProvider).categories();
});
