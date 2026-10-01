import 'package:flutter/material.dart';

import '../../../core/utils/money.dart';

enum TransactionType {
  sale('Sale', Icons.point_of_sale_rounded, true),
  purchase('Purchase', Icons.shopping_cart_rounded, false),
  expense('Expense', Icons.receipt_long_rounded, false),
  income('Income', Icons.savings_rounded, true),
  paymentReceived('Payment received', Icons.call_received_rounded, true),
  paymentSent('Payment sent', Icons.call_made_rounded, false),
  refund('Refund', Icons.undo_rounded, false),
  adjustment('Balance adjustment', Icons.balance_rounded, true),
  transfer('Transfer', Icons.swap_horiz_rounded, false);

  const TransactionType(this.label, this.icon, this.isMoneyIn);
  final String label;
  final IconData icon;
  final bool isMoneyIn;

  String get api => switch (this) {
        paymentReceived => 'payment_received',
        paymentSent => 'payment_sent',
        _ => name,
      };

  static TransactionType fromApi(String v) =>
      values.firstWhere((t) => t.api == v, orElse: () => TransactionType.adjustment);
}

enum PaymentMethod {
  cash('Cash', Icons.payments_rounded),
  bank('Bank', Icons.account_balance_rounded),
  card('Card', Icons.credit_card_rounded),
  wallet('Mobile wallet', Icons.account_balance_wallet_rounded),
  credit('On credit', Icons.schedule_rounded),
  other('Other', Icons.more_horiz_rounded);

  const PaymentMethod(this.label, this.icon);
  final String label;
  final IconData icon;

  static PaymentMethod fromApi(String? v) => values.firstWhere((m) => m.name == v, orElse: () => PaymentMethod.other);
}

class TransactionItem {
  const TransactionItem({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    this.productId,
    this.unitCost,
  });

  final String? productId;
  final String name;
  final double quantity;
  final Money unitPrice;
  final Money? unitCost;
  final Money total;

  factory TransactionItem.fromJson(Map<String, dynamic> j, String currency) => TransactionItem(
        productId: j['product_id'] as String?,
        name: j['name'] as String? ?? 'Item',
        quantity: readQty(j['quantity']),
        unitPrice: Money(readMinor(j['unit_price_minor']) ?? 0, currency),
        unitCost: readMinor(j['unit_cost_minor']) == null ? null : Money(readMinor(j['unit_cost_minor'])!, currency),
        total: Money(readMinor(j['total_minor']) ?? 0, currency),
      );
}

class AppTransaction {
  const AppTransaction({
    required this.id,
    required this.businessId,
    required this.type,
    required this.amount,
    required this.paymentMethod,
    required this.transactionDate,
    required this.createdAt,
    this.paymentProvider,
    this.description,
    this.customerId,
    this.customerName,
    this.supplierId,
    this.supplierName,
    this.categoryName,
    this.expenseCategoryId,
    this.invoiceNumber,
    this.discount,
    this.tax,
    this.subtotal,
    this.source = 'manual',
    this.items = const [],
    this.deletedAt,
    this.deleteReason,
    this.pending = false,
  });

  final String id;
  final String businessId;
  final TransactionType type;
  final Money amount;
  final PaymentMethod paymentMethod;
  final String? paymentProvider;
  final String? description;
  final String? customerId;
  final String? customerName;
  final String? supplierId;
  final String? supplierName;
  final String? expenseCategoryId;
  final String? categoryName;
  final String? invoiceNumber;
  final Money? discount;
  final Money? tax;
  final Money? subtotal;
  final String source;
  final DateTime transactionDate;
  final DateTime createdAt;
  final List<TransactionItem> items;
  final DateTime? deletedAt;
  final String? deleteReason;

  /// Created offline and not yet confirmed by the server.
  final bool pending;

  bool get isDeleted => deletedAt != null;

  String get title {
    if (description != null && description!.trim().isNotEmpty) return description!;
    if (items.isNotEmpty) return items.map((i) => '${_q(i.quantity)} × ${i.name}').join(', ');
    if (categoryName != null) return categoryName!;
    return type.label;
  }

  String? get counterparty => customerName ?? supplierName;

  static String _q(double q) => q == q.roundToDouble() ? q.toInt().toString() : q.toString();

  /// Select clause used by repositories (keeps requests small).
  static const selectColumns =
      'id, business_id, type, amount_minor, currency, subtotal_minor, discount_minor, tax_minor, payment_method, '
      'payment_provider, description, customer_id, supplier_id, expense_category_id, invoice_number, source, '
      'transaction_date, created_at, deleted_at, delete_reason, '
      'customer:customers(name), supplier:suppliers(name), category:expense_categories(name), '
      'items:transaction_items(product_id, name, quantity, unit_price_minor, unit_cost_minor, total_minor)';

  factory AppTransaction.fromJson(Map<String, dynamic> j) {
    final currency = j['currency'] as String? ?? 'PKR';
    Money? m(String k) => readMinor(j[k]) == null ? null : Money(readMinor(j[k])!, currency);
    String? nested(String k) => (j[k] is Map) ? (j[k] as Map)['name'] as String? : null;
    return AppTransaction(
      id: j['id'] as String,
      businessId: j['business_id'] as String,
      type: TransactionType.fromApi(j['type'] as String),
      amount: Money(readMinor(j['amount_minor']) ?? 0, currency),
      subtotal: m('subtotal_minor'),
      discount: m('discount_minor'),
      tax: m('tax_minor'),
      paymentMethod: PaymentMethod.fromApi(j['payment_method'] as String?),
      paymentProvider: j['payment_provider'] as String?,
      description: j['description'] as String?,
      customerId: j['customer_id'] as String?,
      customerName: nested('customer'),
      supplierId: j['supplier_id'] as String?,
      supplierName: nested('supplier'),
      expenseCategoryId: j['expense_category_id'] as String?,
      categoryName: nested('category'),
      invoiceNumber: j['invoice_number'] as String?,
      source: j['source'] as String? ?? 'manual',
      transactionDate: DateTime.parse(j['transaction_date'] as String),
      createdAt: DateTime.parse(j['created_at'] as String),
      deletedAt: j['deleted_at'] == null ? null : DateTime.parse(j['deleted_at'] as String),
      deleteReason: j['delete_reason'] as String?,
      items: ((j['items'] as List?) ?? const [])
          .map((e) => TransactionItem.fromJson(Map<String, dynamic>.from(e as Map), currency))
          .toList(),
    );
  }
}

/// Input for record_transaction(). Built by manual forms and by confirmed AI proposals.
class TransactionDraft {
  TransactionDraft({
    required this.type,
    this.amount,
    this.paymentMethod = PaymentMethod.cash,
    this.paymentProvider,
    this.description,
    this.customerId,
    this.customerName,
    this.createCustomer = false,
    this.supplierId,
    this.supplierName,
    this.createSupplier = false,
    this.expenseCategoryName,
    this.transactionDate,
    this.items = const [],
    this.discount,
    this.source = 'manual',
    this.aiRequestId,
  });

  final TransactionType type;
  final Money? amount;
  final PaymentMethod paymentMethod;
  final String? paymentProvider;
  final String? description;
  final String? customerId;
  final String? customerName;
  final bool createCustomer;
  final String? supplierId;
  final String? supplierName;
  final bool createSupplier;
  final String? expenseCategoryName;
  final DateTime? transactionDate;
  final List<DraftItem> items;
  final Money? discount;
  final String source;
  final String? aiRequestId;

  Map<String, dynamic> toPayload({required String businessId, required String clientRef}) => {
        'business_id': businessId,
        'client_ref': clientRef,
        'type': type.api,
        'amount_minor': ?amount?.minor,
        'currency': ?amount?.currency,
        'payment_method': paymentMethod.name,
        if (paymentProvider != null && paymentProvider!.isNotEmpty) 'payment_provider': paymentProvider,
        if (description != null && description!.trim().isNotEmpty) 'description': description!.trim(),
        'customer_id': ?customerId,
        if (customerId == null && customerName != null) 'customer_name': customerName,
        if (createCustomer) 'create_customer': true,
        'supplier_id': ?supplierId,
        if (supplierId == null && supplierName != null) 'supplier_name': supplierName,
        if (createSupplier) 'create_supplier': true,
        'expense_category_name': ?expenseCategoryName,
        'transaction_date': ?transactionDate?.toUtc().toIso8601String(),
        if (discount != null && discount!.minor > 0) 'discount_minor': discount!.minor,
        if (items.isNotEmpty) 'items': items.map((i) => i.toJson()).toList(),
        'source': source,
        'ai_request_id': ?aiRequestId,
      };
}

class DraftItem {
  const DraftItem({required this.name, required this.quantity, this.productId, this.unitPrice});
  final String? productId;
  final String name;
  final double quantity;
  final Money? unitPrice;

  Map<String, dynamic> toJson() => {
        'product_id': ?productId,
        'name': name,
        'quantity': quantity,
        'unit_price_minor': ?unitPrice?.minor,
      };
}
