import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/local_store.dart';
import '../../../core/services/supabase_service.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/money.dart';
import '../../business/data/business_repository.dart';
import '../domain/dashboard_models.dart';

/// Read models for the dashboard & reports. Every number is calculated in
/// Postgres; the client never aggregates raw transactions (and never uses AI).
class DashboardRepository {
  DashboardRepository(this._client, this._store, this._businessId, this._currency);
  final SupabaseClient _client;
  final KeyValueStore _store;
  final String _businessId;
  final String _currency;

  Map<String, dynamic> _args(DateFilter f) => {'p_business_id': _businessId, ...f.toRpcArgs()};

  Future<DashboardSummary> summary(DateFilter f) async {
    final cacheKey = 'bp_dash_${_businessId}_${f.cacheKey}';
    try {
      final json = Map<String, dynamic>.from(await _client.rpc('dashboard_summary', params: _args(f)) as Map);
      await _store.setString(cacheKey, jsonEncode(json));
      return DashboardSummary.fromJson(json);
    } catch (e) {
      final failure = AppFailure.from(e);
      final cached = _store.getString(cacheKey);
      if (failure.isNetwork && cached != null) {
        return DashboardSummary.fromJson(Map<String, dynamic>.from(jsonDecode(cached) as Map), fromCache: true);
      }
      throw failure;
    }
  }

  Future<List<SeriesPoint>> series(DateFilter f) async {
    try {
      final rows = await _client.rpc('sales_timeseries', params: _args(f)) as List;
      return rows.map((r) {
        final m = Map<String, dynamic>.from(r as Map);
        return SeriesPoint(
          DateTime.parse(m['day'] as String),
          Money(readMinor(m['sales_minor']) ?? 0, _currency),
          Money(readMinor(m['expenses_minor']) ?? 0, _currency),
          Money(readMinor(m['purchases_minor']) ?? 0, _currency),
        );
      }).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<List<CategoryAmount>> expenseBreakdown(DateFilter f) async {
    try {
      final rows = await _client.rpc('expense_breakdown', params: _args(f)) as List;
      return rows.map((r) {
        final m = Map<String, dynamic>.from(r as Map);
        return CategoryAmount(
          m['category'] as String,
          Money(readMinor(m['amount_minor']) ?? 0, _currency),
          (m['count'] as num).toInt(),
        );
      }).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<List<TopProduct>> topProducts(DateFilter f, {int limit = 10}) async {
    try {
      final rows = await _client.rpc('top_products', params: {..._args(f), 'p_limit': limit}) as List;
      return rows.map((r) {
        final m = Map<String, dynamic>.from(r as Map);
        final cost = readMinor(m['cost_minor']);
        return TopProduct(
          m['product_id'] as String?,
          m['name'] as String,
          readQty(m['quantity']),
          Money(readMinor(m['revenue_minor']) ?? 0, _currency),
          cost == null ? null : Money(cost, _currency),
        );
      }).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<List<LowStockItem>> lowStock() async {
    try {
      final rows = await _client.rpc('low_stock_products', params: {'p_business_id': _businessId}) as List;
      return rows.map((r) {
        final m = Map<String, dynamic>.from(r as Map);
        return LowStockItem(
          m['id'] as String,
          m['name'] as String,
          readQty(m['stock_quantity']),
          readQty(m['minimum_stock']),
          m['unit'] as String? ?? 'pcs',
        );
      }).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  final b = ref.watch(businessProvider);
  return DashboardRepository(ref.supabase, ref.watch(keyValueStoreProvider), b.id, b.currency);
});

class DashboardFilter extends Notifier<DateFilter> {
  @override
  DateFilter build() => const DateFilter.today();
  void set(DateFilter f) => state = f;
}

final dashboardFilterProvider = NotifierProvider<DashboardFilter, DateFilter>(DashboardFilter.new);

final summaryProvider = FutureProvider.autoDispose.family<DashboardSummary, DateFilter>((ref, f) async {
  ref.watch(dataVersionProvider);
  return ref.watch(dashboardRepositoryProvider).summary(f);
});

/// Trend chart: single-day presets show the last 7 days for context.
final seriesProvider = FutureProvider.autoDispose.family<List<SeriesPoint>, DateFilter>((ref, f) async {
  ref.watch(dataVersionProvider);
  final range = f.preset.isSingleDay ? const DateFilter(DatePreset.last7) : f;
  return ref.watch(dashboardRepositoryProvider).series(range);
});

final expenseBreakdownProvider = FutureProvider.autoDispose.family<List<CategoryAmount>, DateFilter>((ref, f) async {
  ref.watch(dataVersionProvider);
  return ref.watch(dashboardRepositoryProvider).expenseBreakdown(f);
});

final topProductsProvider = FutureProvider.autoDispose.family<List<TopProduct>, DateFilter>((ref, f) async {
  ref.watch(dataVersionProvider);
  return ref.watch(dashboardRepositoryProvider).topProducts(f);
});

final lowStockProvider = FutureProvider.autoDispose<List<LowStockItem>>((ref) async {
  ref.watch(dataVersionProvider);
  return ref.watch(dashboardRepositoryProvider).lowStock();
});
