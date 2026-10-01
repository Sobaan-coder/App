import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/debouncer.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/states.dart';
import '../data/search_repository.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _debounce = Debouncer();
  String _q = '';

  @override
  void dispose() {
    _debounce.dispose();
    super.dispose();
  }

  static (IconData, String) _meta(String kind) => switch (kind) {
        'customer' => (Icons.person_outline_rounded, '/customers'),
        'supplier' => (Icons.local_shipping_outlined, '/suppliers'),
        'product' => (Icons.sell_outlined, '/products'),
        'expense' => (Icons.payments_outlined, '/transactions'),
        _ => (Icons.receipt_long_outlined, '/transactions'),
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Search customers, products, invoices…', border: InputBorder.none,
              filled: false, prefixIcon: Icon(Icons.search_rounded)),
          onChanged: (v) => _debounce(() => setState(() => _q = v)),
        ),
      ),
      body: _q.trim().length < 2
          ? const EmptyState(icon: Icons.search_rounded, title: 'Search everything',
              message: 'Type a name like “Ahmed”, a product, or an invoice number like INV-1024.')
          : AsyncView<List<SearchHit>>(
              value: ref.watch(searchProvider(_q)),
              builder: (hits) => hits.isEmpty
                  ? EmptyState(icon: Icons.search_off_rounded, title: 'No results for “$_q”')
                  : ListView(children: [
                      for (final h in hits)
                        ListTile(
                          leading: Icon(_meta(h.kind).$1),
                          title: Text(h.title),
                          subtitle: Text([Fmt.titleCase(h.kind), if (h.subtitle.isNotEmpty) Fmt.enumLabel(h.subtitle),
                            if (h.occurredAt != null && (h.kind == 'transaction' || h.kind == 'expense')) Fmt.date(h.occurredAt!)].join(' · ')),
                          onTap: () => context.push('${_meta(h.kind).$2}/${h.id}'),
                        ),
                    ]),
            ),
    );
  }
}
