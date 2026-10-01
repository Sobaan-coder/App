import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/services/supabase_service.dart';
import '../../business/data/business_repository.dart';

class SearchHit {
  const SearchHit(this.kind, this.id, this.title, this.subtitle, this.occurredAt);
  final String kind;
  final String id;
  final String title;
  final String subtitle;
  final DateTime? occurredAt;
}

/// Server-side search across customers, suppliers, products and transactions.
final searchProvider = FutureProvider.autoDispose.family<List<SearchHit>, String>((ref, query) async {
  if (query.trim().length < 2) return const [];
  final b = ref.watch(businessProvider);
  try {
    final rows = await ref.supabase.rpc('global_search', params: {'p_business_id': b.id, 'p_query': query.trim()}) as List;
    return rows.map((r) {
      final m = Map<String, dynamic>.from(r as Map);
      return SearchHit(
        m['kind'] as String,
        m['id'] as String,
        m['title'] as String? ?? '',
        m['subtitle'] as String? ?? '',
        m['occurred_at'] == null ? null : DateTime.parse(m['occurred_at'] as String),
      );
    }).toList();
  } catch (e) {
    throw AppFailure.from(e);
  }
});
