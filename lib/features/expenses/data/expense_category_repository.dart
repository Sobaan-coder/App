import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';

class ExpenseCategory {
  const ExpenseCategory(this.id, this.name, this.isDefault);
  final String id;
  final String name;
  final bool isDefault;
}

class ExpenseCategoryRepository {
  ExpenseCategoryRepository(this._ref, this._client, this._businessId);
  final Ref _ref;
  final SupabaseClient _client;
  final String _businessId;

  Future<List<ExpenseCategory>> list() async {
    final rows = await _client
        .from('expense_categories')
        .select('id, name, is_default')
        .eq('business_id', _businessId)
        .order('name');
    return rows.map((r) => ExpenseCategory(r['id'] as String, r['name'] as String, r['is_default'] as bool? ?? false)).toList();
  }

  Future<void> add(String name) async {
    try {
      await _client.from('expense_categories').insert({'business_id': _businessId, 'name': name.trim()});
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> rename(String id, String name) async {
    try {
      await _client.from('expense_categories').update({'name': name.trim()}).eq('id', id);
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final expenseCategoryRepositoryProvider = Provider<ExpenseCategoryRepository>((ref) {
  final b = ref.watch(businessProvider);
  return ExpenseCategoryRepository(ref, ref.supabase, b.id);
});

final expenseCategoriesProvider = FutureProvider.autoDispose<List<ExpenseCategory>>((ref) async {
  ref.watch(dataVersionProvider);
  return ref.watch(expenseCategoryRepositoryProvider).list();
});
