import 'package:businesspilot/core/utils/date_range.dart';
import 'package:businesspilot/core/utils/money.dart';
import 'package:businesspilot/core/errors/app_failure.dart';
import 'package:businesspilot/features/business/domain/business.dart';
import 'package:businesspilot/features/subscription/domain/plan.dart';
import 'package:businesspilot/features/transactions/domain/transaction.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  group('permissions mirror server roles', () {
    test('viewer is read-only', () {
      expect(MemberRole.viewer.canRecord, isFalse);
      expect(MemberRole.viewer.canEditTransactions, isFalse);
    });
    test('employee records but cannot manage', () {
      expect(MemberRole.employee.canRecord, isTrue);
      expect(MemberRole.employee.canDeleteTransactions, isFalse);
      expect(MemberRole.employee.canManageSettings, isFalse);
      expect(MemberRole.employee.canEditCatalogue, isFalse);
    });
    test('only owner manages billing', () {
      expect(MemberRole.admin.canManageBilling, isFalse);
      expect(MemberRole.owner.canManageBilling, isTrue);
    });
  });

  test('transaction draft payload uses minor units and idempotency key', () {
    final d = TransactionDraft(
      type: TransactionType.paymentReceived,
      amount: Money.tryParse('5,000', 'PKR'),
      customerName: 'Ahmed',
      createCustomer: true,
      items: const [],
    );
    final p = d.toPayload(businessId: 'b1', clientRef: 'ref-1');
    expect(p['type'], 'payment_received');
    expect(p['amount_minor'], 500000);
    expect(p['client_ref'], 'ref-1');
    expect(p['create_customer'], isTrue);
    expect(p.containsKey('items'), isFalse);
  });

  test('date filter produces server presets', () {
    expect(const DateFilter.today().toRpcArgs(), {'p_preset': 'today'});
    final custom = DateFilter(DatePreset.custom, from: DateTime(2026, 1, 1), to: DateTime(2026, 1, 31)).toRpcArgs();
    expect(custom, {'p_preset': 'custom', 'p_from': '2026-01-01', 'p_to': '2026-01-31'});
  });

  test('plans come from data, not constants', () {
    final p = Plan.fromJson({
      'id': 'pro',
      'name': 'Pro',
      'price_monthly_minor': 999,
      'price_currency': 'USD',
      'max_transactions_per_month': null,
      'max_products': null,
      'max_users': 5,
      'ai_requests_per_month': 1000,
      'features': {'pdf_invoices': true, 'reports': 'full'},
    });
    expect(p.price.format(), r'$9.99');
    expect(p.highlights, contains('Unlimited transactions'));
    expect(p.highlights, contains('PDF invoices'));
    expect(p.feature('api_access'), isFalse);
  });

  test('server errors map to friendly messages (never raw exceptions)', () {
    final f = AppFailure.from(const PostgrestException(message: 'plan_limit:transactions'));
    expect(f.code, 'plan_limit:transactions');
    expect(f.message, contains('limit'));
    expect(AppFailure.from(Exception('weird internal stack')).message, 'Something went wrong. Please try again.');
    expect(AppFailure.from(Exception('SocketException: Failed host lookup')).isNetwork, isTrue);
    expect(AppFailure.from(const PostgrestException(message: 'forbidden')).message, contains('permission'));
  });
}
