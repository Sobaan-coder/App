/// Client-side model of the Proposal returned by the ai-process Edge Function.
/// Parsing is defensive: anything unexpected becomes an error proposal and is
/// never executed.
enum ProposalKind { action, clarification, answer, error }

enum ProposalActionKind { recordTransaction, addProduct, updateProduct, adjustInventory }

class PreviewLine {
  const PreviewLine(this.label, this.value);
  final String label;
  final String value;
}

class ClarificationOption {
  const ClarificationOption(this.label, this.value);
  final String label;
  final String value;
}

class ProposalAction {
  const ProposalAction(this.kind, this.payload);
  final ProposalActionKind kind;
  final Map<String, dynamic> payload;
}

class AiProposal {
  const AiProposal({
    required this.kind,
    required this.intent,
    required this.message,
    this.confidence = 0,
    this.requiresConfirmation = true,
    this.autoCommit = false,
    this.riskReasons = const [],
    this.action,
    this.previewTitle,
    this.lines = const [],
    this.effects = const [],
    this.warnings = const [],
    this.question,
    this.options = const [],
    this.answerText,
    this.answerRoute,
    this.aiRequestId,
  });

  final ProposalKind kind;
  final String intent;
  final String message;
  final double confidence;
  final bool requiresConfirmation;
  final bool autoCommit;
  final List<String> riskReasons;
  final ProposalAction? action;
  final String? previewTitle;
  final List<PreviewLine> lines;
  final List<String> effects;
  final List<String> warnings;
  final String? question;
  final List<ClarificationOption> options;
  final String? answerText;
  final String? answerRoute;
  final String? aiRequestId;

  static const _actionKinds = {
    'record_transaction': ProposalActionKind.recordTransaction,
    'add_product': ProposalActionKind.addProduct,
    'update_product': ProposalActionKind.updateProduct,
    'adjust_inventory': ProposalActionKind.adjustInventory,
  };

  static AiProposal error(String message) =>
      AiProposal(kind: ProposalKind.error, intent: 'unknown', message: message);

  factory AiProposal.fromJson(Map<String, dynamic> j) {
    try {
      final kind = ProposalKind.values.firstWhere((k) => k.name == j['kind'],
          orElse: () => throw const FormatException('kind'));
      final rawAction = j['action'];
      ProposalAction? action;
      if (rawAction is Map) {
        final ak = _actionKinds[rawAction['kind']];
        final payload = rawAction['payload'];
        if (ak == null || payload is! Map) throw const FormatException('action');
        action = ProposalAction(ak, Map<String, dynamic>.from(payload));
      }
      if (kind == ProposalKind.action && action == null) throw const FormatException('missing action');
      final preview = j['preview'] is Map ? Map<String, dynamic>.from(j['preview'] as Map) : const <String, dynamic>{};
      List<String> strings(Object? v) => (v is List) ? v.map((e) => e.toString()).toList() : const [];
      final answer = j['answer'] is Map ? Map<String, dynamic>.from(j['answer'] as Map) : null;
      return AiProposal(
        kind: kind,
        intent: j['intent']?.toString() ?? 'unknown',
        message: j['message']?.toString() ?? '',
        confidence: (j['confidence'] as num?)?.toDouble() ?? 0,
        // Fail safe: anything not explicitly marked otherwise needs confirmation.
        requiresConfirmation: j['requires_confirmation'] != false,
        autoCommit: j['auto_commit'] == true && j['requires_confirmation'] == false,
        riskReasons: strings(j['risk_reasons']),
        action: action,
        previewTitle: preview['title']?.toString(),
        lines: ((preview['lines'] as List?) ?? const [])
            .whereType<Map>()
            .map((l) => PreviewLine(l['label'].toString(), l['value'].toString()))
            .toList(),
        effects: strings(preview['effects']),
        warnings: strings(preview['warnings']),
        question: j['question']?.toString(),
        options: ((j['options'] as List?) ?? const [])
            .whereType<Map>()
            .map((o) => ClarificationOption(o['label'].toString(), o['value'].toString()))
            .toList(),
        answerText: answer?['text']?.toString(),
        answerRoute: answer?['open']?.toString(),
        aiRequestId: j['ai_request_id']?.toString(),
      );
    } on Object {
      return AiProposal.error('The assistant returned something unexpected. Nothing was recorded.');
    }
  }
}
