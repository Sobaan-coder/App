import 'package:businesspilot/features/ai_assistant/domain/ai_proposal.dart';
import 'package:businesspilot/shared/widgets/ai_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

const proposal = AiProposal(
  kind: ProposalKind.action,
  intent: 'record_sale',
  message: 'Sale detected',
  previewTitle: 'Sale detected',
  lines: [PreviewLine('Items', '5 × Zinger Burger'), PreviewLine('Amount', 'Rs 2,500'), PreviewLine('Payment', 'Cash')],
  effects: ['Inventory will decrease: Zinger Burger −5'],
);

void main() {
  testWidgets('shows the structured sale preview and confirms', (tester) async {
    var confirmed = false;
    await pumpApp(
      tester,
      Scaffold(
        body: AITransactionPreview(
          proposal: proposal,
          status: PreviewStatus.pending,
          onConfirm: () => confirmed = true,
          onCancel: () {},
        ),
      ),
    );
    expect(find.text('Sale detected'), findsOneWidget);
    expect(find.text('5 × Zinger Burger'), findsOneWidget);
    expect(find.text('Rs 2,500'), findsOneWidget);
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('Inventory will decrease: Zinger Burger −5'), findsOneWidget);
    await tester.tap(find.text('Confirm sale'));
    expect(confirmed, isTrue);
  });

  testWidgets('recorded state shows result and undo, not buttons', (tester) async {
    var undone = false;
    await pumpApp(
      tester,
      Scaffold(
        body: AITransactionPreview(
          proposal: proposal,
          status: PreviewStatus.committed,
          resultText: 'Sale recorded · INV-1001',
          onUndo: () => undone = true,
        ),
      ),
    );
    expect(find.text('Sale recorded · INV-1001'), findsOneWidget);
    expect(find.text('Confirm sale'), findsNothing);
    await tester.tap(find.text('Undo'));
    expect(undone, isTrue);
  });

  testWidgets('cancelled state says nothing was recorded', (tester) async {
    await pumpApp(
      tester,
      const Scaffold(
        body: AITransactionPreview(proposal: proposal, status: PreviewStatus.cancelled),
      ),
    );
    expect(find.text('Cancelled — nothing was recorded.'), findsOneWidget);
  });
}
