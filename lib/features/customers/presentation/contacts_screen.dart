import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/app_bottom_sheet.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/contact_card.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../../core/utils/money.dart';
import '../../business/data/business_repository.dart';
import '../data/contact_repository.dart';
import '../domain/contact.dart';

/// Customers list or suppliers list (same UI, different [kind]).
class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key, required this.kind});
  final ContactKind kind;
  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  String _q = '';
  bool _owingOnly = false;

  @override
  Widget build(BuildContext context) {
    final kind = widget.kind;
    final business = ref.watch(businessProvider);
    final base = kind == ContactKind.customer ? '/customers' : '/suppliers';
    return Scaffold(
      appBar: AppBar(title: Text(kind.pluralLabel), actions: const [ShellActions()]),
      floatingActionButton: business.role.canRecord
          ? FloatingActionButton.extended(
              onPressed: () => showContactForm(context, kind),
              icon: const Icon(Icons.person_add_alt_rounded),
              label: Text(kind.label),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search ${kind.pluralLabel.toLowerCase()}',
                prefixIcon: const Icon(Icons.search_rounded),
              ),
              onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                FilterChip(
                  label: Text(kind == ContactKind.customer ? 'Owe me money' : 'I owe them'),
                  selected: _owingOnly,
                  onSelected: (v) => setState(() => _owingOnly = v),
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView<List<Contact>>(
              value: ref.watch(contactsProvider(kind)),
              onRetry: () => ref.invalidate(contactsProvider(kind)),
              builder: (list) {
                final filtered = list
                    .where(
                      (c) =>
                          (_q.isEmpty || c.name.toLowerCase().contains(_q) || (c.phone ?? '').contains(_q)) &&
                          (!_owingOnly || (c.outstanding?.minor ?? 0) > 0),
                    )
                    .toList();
                if (list.isEmpty) {
                  return EmptyState(
                    icon: Icons.people_outline_rounded,
                    title: 'No ${kind.pluralLabel.toLowerCase()} yet',
                    message: kind == ContactKind.customer
                        ? 'Customers are added automatically when you say things like “Ali owes me 3000”.'
                        : 'Suppliers are added when you record purchases from them.',
                  );
                }
                final total = filtered.fold<int>(0, (s, c) => s + ((c.outstanding?.minor ?? 0) > 0 ? c.outstanding!.minor : 0));
                return ListView(
                  padding: const EdgeInsets.only(bottom: 96),
                  children: [
                    if (total > 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        child: Text(
                          kind == ContactKind.customer
                              ? 'Customers owe you ${Money(total, business.currency).format()}'
                              : 'You owe suppliers ${Money(total, business.currency).format()}',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                    for (final c in filtered) ContactCard(contact: c, onTap: () => context.push('$base/${c.id}')),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> showContactForm(BuildContext context, ContactKind kind, {Contact? existing}) => showAppBottomSheet(
  context,
  title: existing == null ? 'New ${kind.label.toLowerCase()}' : 'Edit ${existing.name}',
  child: _ContactForm(kind: kind, existing: existing),
);

class _ContactForm extends ConsumerStatefulWidget {
  const _ContactForm({required this.kind, this.existing});
  final ContactKind kind;
  final Contact? existing;
  @override
  ConsumerState<_ContactForm> createState() => _ContactFormState();
}

class _ContactFormState extends ConsumerState<_ContactForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name);
  late final _phone = TextEditingController(text: widget.existing?.phone);
  late final _email = TextEditingController(text: widget.existing?.email);
  late final _address = TextEditingController(text: widget.existing?.address);
  late final _notes = TextEditingController(text: widget.existing?.notes);
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _address, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            label: 'Name',
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            validator: (v) => Validators.required(v, 'Name'),
          ),
          const SizedBox(height: Gap.md),
          AppTextField(label: 'Phone', controller: _phone, keyboardType: TextInputType.phone, prefixIcon: Icons.phone_outlined),
          const SizedBox(height: Gap.md),
          AppTextField(
            label: 'Email',
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.mail_outline_rounded,
            validator: (v) => (v == null || v.trim().isEmpty) ? null : Validators.email(v),
          ),
          const SizedBox(height: Gap.md),
          AppTextField(label: 'Address', controller: _address, maxLines: 2),
          const SizedBox(height: Gap.md),
          AppTextField(label: 'Notes', controller: _notes, maxLines: 3),
          const SizedBox(height: Gap.xl),
          AppButton(
            label: 'Save',
            loading: _saving,
            expand: true,
            onPressed: () async {
              if (!_form.currentState!.validate()) return;
              setState(() => _saving = true);
              String? n(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
              final fields = {
                'name': _name.text.trim(),
                'phone': n(_phone),
                'email': n(_email),
                'address': n(_address),
                'notes': n(_notes),
              };
              try {
                final repo = ref.read(contactRepositoryProvider);
                if (widget.existing == null) {
                  await repo.create(widget.kind, fields);
                } else {
                  await repo.update(widget.kind, widget.existing!.id, fields);
                }
                if (context.mounted) Navigator.pop(context);
              } catch (e) {
                if (context.mounted) showError(context, e);
              } finally {
                if (mounted) setState(() => _saving = false);
              }
            },
          ),
        ],
      ),
    );
  }
}
