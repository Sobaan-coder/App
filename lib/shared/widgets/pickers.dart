import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/formatters.dart';
import '../../features/customers/data/contact_repository.dart';
import '../../features/customers/domain/contact.dart';
import '../../features/products/data/product_repository.dart';
import '../../features/products/domain/product.dart';

/// Result of picking a contact: an existing one, or a new name to create.
class ContactChoice {
  const ContactChoice({this.id, required this.name, this.isNew = false});
  final String? id;
  final String name;
  final bool isNew;
}

/// Autocomplete over existing customers/suppliers, with "Add new …".
class ContactPicker extends ConsumerWidget {
  const ContactPicker({super.key, required this.kind, required this.value, required this.onChanged, this.required = false});
  final ContactKind kind;
  final ContactChoice? value;
  final ValueChanged<ContactChoice?> onChanged;
  final bool required;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contacts = ref.watch(contactsProvider(kind)).value ?? const <Contact>[];
    return Autocomplete<ContactChoice>(
      initialValue: TextEditingValue(text: value?.name ?? ''),
      displayStringForOption: (c) => c.name,
      optionsBuilder: (text) {
        final q = text.text.trim().toLowerCase();
        final matches = contacts
            .where((c) => q.isEmpty || c.name.toLowerCase().contains(q) || (c.phone ?? '').contains(q))
            .take(8)
            .map((c) => ContactChoice(id: c.id, name: c.name))
            .toList();
        if (q.isNotEmpty && !contacts.any((c) => c.name.toLowerCase() == q)) {
          matches.add(ContactChoice(name: Fmt.titleCase(text.text.trim()), isNew: true));
        }
        return matches;
      },
      onSelected: onChanged,
      optionsViewBuilder: (context, onSelected, options) => Align(
        alignment: AlignmentDirectional.topStart,
        child: Material(
          elevation: 4,
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280, maxWidth: 420),
            child: ListView(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              children: [
                for (final o in options)
                  ListTile(
                    leading: Icon(o.isNew ? Icons.person_add_alt_rounded : Icons.person_outline_rounded),
                    title: Text(o.isNew ? 'Add new ${kind.label.toLowerCase()} “${o.name}”' : o.name),
                    onTap: () => onSelected(o),
                  ),
              ],
            ),
          ),
        ),
      ),
      fieldViewBuilder: (context, controller, focus, onSubmit) => TextFormField(
        controller: controller,
        focusNode: focus,
        decoration: InputDecoration(
          labelText: required ? kind.label : '${kind.label} (optional)',
          prefixIcon: const Icon(Icons.person_outline_rounded),
          suffixIcon: value == null
              ? null
              : IconButton(
                  tooltip: 'Clear',
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () {
                    controller.clear();
                    onChanged(null);
                  },
                ),
        ),
        validator: (_) => required && value == null ? 'Choose a ${kind.label.toLowerCase()}' : null,
        onChanged: (t) {
          if (value != null && t != value!.name) onChanged(null);
        },
      ),
    );
  }
}

/// Bottom sheet to pick a product (with search).
Future<Product?> pickProduct(BuildContext context) {
  return showModalBottomSheet<Product>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (ctx) => const _ProductPickerSheet(),
  );
}

class _ProductPickerSheet extends ConsumerStatefulWidget {
  const _ProductPickerSheet();
  @override
  ConsumerState<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends ConsumerState<_ProductPickerSheet> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final products = ref.watch(productsProvider);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(hintText: 'Search products', prefixIcon: Icon(Icons.search_rounded)),
              onChanged: (v) => setState(() => _q = v.toLowerCase()),
            ),
          ),
          Expanded(
            child: products.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => const Center(child: Text('Could not load products')),
              data: (list) {
                final filtered = list
                    .where((p) => p.isActive && (p.name.toLowerCase().contains(_q) || (p.sku ?? '').toLowerCase().contains(_q)))
                    .toList();
                if (filtered.isEmpty) return const Center(child: Text('No products found'));
                return ListView.builder(
                  controller: scroll,
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => ListTile(
                    title: Text(filtered[i].name),
                    subtitle: Text(
                      filtered[i].trackInventory ? '${Fmt.qty(filtered[i].stockQuantity)} ${filtered[i].unit} in stock' : '',
                    ),
                    trailing: Text(filtered[i].sellingPrice?.format() ?? '—'),
                    onTap: () => Navigator.pop(context, filtered[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
