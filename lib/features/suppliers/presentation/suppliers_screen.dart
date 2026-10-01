import 'package:flutter/material.dart';

import '../../customers/domain/contact.dart';
import '../../customers/presentation/contacts_screen.dart';

/// Suppliers reuse the contact screens with ContactKind.supplier.
class SuppliersScreen extends StatelessWidget {
  const SuppliersScreen({super.key});
  @override
  Widget build(BuildContext context) => const ContactsScreen(kind: ContactKind.supplier);
}
