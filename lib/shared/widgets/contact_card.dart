import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../features/customers/domain/contact.dart';

/// CustomerCard / SupplierCard.
class ContactCard extends StatelessWidget {
  const ContactCard({super.key, required this.contact, this.onTap});
  final Contact contact;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final owed = contact.outstanding;
    final hasBalance = owed != null && owed.minor > 0;
    final label = contact.kind == ContactKind.customer ? 'Owes you' : 'You owe';
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(child: Text(contact.initials)),
      title: Text(contact.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(contact.phone ?? 'No phone'),
      trailing: hasBalance
          ? Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(label, style: t.textTheme.labelSmall),
              Text(owed.format(),
                  style: t.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: contact.kind == ContactKind.customer ? context.semantic.warning : context.semantic.expense)),
            ])
          : Text('Settled', style: t.textTheme.labelMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
    );
  }
}
