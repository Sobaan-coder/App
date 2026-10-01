import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/data_version.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';
import '../domain/contact.dart';

/// Customers and suppliers share one repository, parameterised by [ContactKind].
class ContactRepository {
  ContactRepository(this._ref, this._client, this._businessId, this._currency);
  final Ref _ref;
  final SupabaseClient _client;
  final String _businessId;
  final String _currency;

  Future<List<Contact>> list(ContactKind kind, {String? search, bool owingOnly = false}) async {
    try {
      var q = _client.from(kind.balanceView).select().eq('business_id', _businessId);
      if (search != null && search.trim().length >= 2) {
        final s = search.trim().replaceAll(RegExp(r'[%_,()]'), '');
        q = q.or('name.ilike.%$s%,phone.ilike.%$s%');
      }
      if (owingOnly) q = q.gt('outstanding_minor', 0);
      final rows = await q.order(owingOnly ? 'outstanding_minor' : 'name', ascending: !owingOnly).limit(500);
      return rows.map((r) => Contact.fromBalanceJson(r, kind, _currency)).toList();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<Contact> get(ContactKind kind, String id) async {
    try {
      final results = await Future.wait([
        _client.from(kind.balanceView).select().eq(kind.idColumn, id).single(),
        _client.from(kind.table).select('name, phone, email, address, notes').eq('id', id).single(),
      ]);
      return Contact.fromBalanceJson(results[0], kind, _currency).withDetails(results[1]);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<String> create(ContactKind kind, Map<String, dynamic> fields) async {
    try {
      final row = await _client.from(kind.table).insert({...fields, 'business_id': _businessId}).select('id').single();
      _ref.read(dataVersionProvider.notifier).bump();
      return row['id'] as String;
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> update(ContactKind kind, String id, Map<String, dynamic> fields) async {
    try {
      await _client.from(kind.table).update(fields).eq('id', id);
      _ref.read(dataVersionProvider.notifier).bump();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  Future<void> archive(ContactKind kind, String id) => update(kind, id, {'deleted_at': DateTime.now().toUtc().toIso8601String()});
}

final contactRepositoryProvider = Provider<ContactRepository>((ref) {
  final b = ref.watch(businessProvider);
  return ContactRepository(ref, ref.supabase, b.id, b.currency);
});

final contactsProvider = FutureProvider.autoDispose.family<List<Contact>, ContactKind>((ref, kind) async {
  ref.watch(dataVersionProvider);
  return ref.watch(contactRepositoryProvider).list(kind);
});

final contactProvider = FutureProvider.autoDispose.family<Contact, (ContactKind, String)>((ref, key) async {
  ref.watch(dataVersionProvider);
  return ref.watch(contactRepositoryProvider).get(key.$1, key.$2);
});
