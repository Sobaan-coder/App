import '../../../core/utils/money.dart';

enum ContactKind {
  customer('customers', 'customer_balances', 'customer_id', 'Customer', 'Customers'),
  supplier('suppliers', 'supplier_balances', 'supplier_id', 'Supplier', 'Suppliers');

  const ContactKind(this.table, this.balanceView, this.idColumn, this.label, this.pluralLabel);
  final String table;
  final String balanceView;
  final String idColumn;
  final String label;
  final String pluralLabel;
}

/// A customer or supplier, with balances computed by the database views.
class Contact {
  const Contact({
    required this.id,
    required this.kind,
    required this.name,
    required this.currency,
    this.phone,
    this.email,
    this.address,
    this.notes,
    this.totalPurchases,
    this.totalPayments,
    this.outstanding,
    this.lastTransactionAt,
  });

  final String id;
  final ContactKind kind;
  final String name;
  final String currency;
  final String? phone;
  final String? email;
  final String? address;
  final String? notes;
  final Money? totalPurchases;
  final Money? totalPayments;

  /// Customer: what they owe you. Supplier: what you owe them.
  final Money? outstanding;
  final DateTime? lastTransactionAt;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }

  factory Contact.fromBalanceJson(Map<String, dynamic> j, ContactKind kind, String currency) => Contact(
    id: j[kind.idColumn] as String,
    kind: kind,
    name: j['name'] as String,
    phone: j['phone'] as String?,
    currency: currency,
    totalPurchases: Money(readMinor(j['total_purchases_minor']) ?? 0, currency),
    totalPayments: Money(readMinor(j['total_payments_minor']) ?? 0, currency),
    outstanding: Money(readMinor(j['outstanding_minor']) ?? 0, currency),
    lastTransactionAt: j['last_transaction_at'] == null ? null : DateTime.parse(j['last_transaction_at'] as String),
  );

  Contact withDetails(Map<String, dynamic> j) => Contact(
    id: id,
    kind: kind,
    name: j['name'] as String? ?? name,
    currency: currency,
    phone: j['phone'] as String?,
    email: j['email'] as String?,
    address: j['address'] as String?,
    notes: j['notes'] as String?,
    totalPurchases: totalPurchases,
    totalPayments: totalPayments,
    outstanding: outstanding,
    lastTransactionAt: lastTransactionAt,
  );
}
