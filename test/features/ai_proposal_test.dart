import 'package:businesspilot/features/ai_assistant/domain/ai_proposal.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final valid = {
    'kind': 'action',
    'intent': 'record_sale',
    'confidence': 0.95,
    'message': 'Sale detected',
    'requires_confirmation': false,
    'auto_commit': true,
    'risk_reasons': <String>[],
    'action': {
      'kind': 'record_transaction',
      'payload': {'type': 'sale', 'amount_minor': 250000, 'payment_method': 'cash'},
    },
    'preview': {
      'title': 'Sale detected',
      'lines': [
        {'label': 'Items', 'value': '5 × Zinger Burger'},
        {'label': 'Amount', 'value': 'Rs 2,500'},
      ],
      'effects': ['Inventory will decrease: Zinger Burger −5'],
      'warnings': <String>[],
    },
  };

  test('parses a valid action proposal', () {
    final p = AiProposal.fromJson(valid);
    expect(p.kind, ProposalKind.action);
    expect(p.action!.kind, ProposalActionKind.recordTransaction);
    expect(p.lines.map((l) => l.value), ['5 × Zinger Burger', 'Rs 2,500']);
    expect(p.autoCommit, isTrue);
  });

  test('unknown action kinds are never executed', () {
    final p = AiProposal.fromJson({
      ...valid,
      'action': {'kind': 'transfer_money', 'payload': {}},
    });
    expect(p.kind, ProposalKind.error);
    expect(p.action, isNull);
  });

  test('missing confirmation flag fails safe (requires confirmation, no auto-commit)', () {
    final m = Map<String, dynamic>.from(valid)..remove('requires_confirmation');
    final p = AiProposal.fromJson(m);
    expect(p.requiresConfirmation, isTrue);
    expect(p.autoCommit, isFalse);
  });

  test('auto_commit without explicit requires_confirmation=false is ignored', () {
    final p = AiProposal.fromJson({...valid, 'requires_confirmation': true, 'auto_commit': true});
    expect(p.autoCommit, isFalse);
  });

  test('action kind without an action payload is rejected', () {
    final p = AiProposal.fromJson({...valid, 'action': null});
    expect(p.kind, ProposalKind.error);
  });

  test('parses clarification with options and answers', () {
    final c = AiProposal.fromJson({
      'kind': 'clarification',
      'intent': 'record_sale',
      'message': 'Which one?',
      'question': 'Which one?',
      'options': [
        {'label': 'Zinger Burger', 'value': 'Zinger Burger'},
      ],
    });
    expect(c.options.single.label, 'Zinger Burger');
    final a = AiProposal.fromJson({
      'kind': 'answer',
      'intent': 'query_sales',
      'message': 'x',
      'answer': {'text': 'You sold Rs 1,000 today.', 'open': '/transactions'},
    });
    expect(a.answerText, 'You sold Rs 1,000 today.');
    expect(a.answerRoute, '/transactions');
  });
}
