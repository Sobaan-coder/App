// Confirmation policy for AI-proposed financial actions.
// Low-risk, high-confidence entries may be recorded immediately (with Undo);
// everything else needs an explicit tap on "Confirm".
// The assistant never moves money — it only records what already happened.

export interface RiskInput {
  type: string;
  intent: string;
  amountMinor: number;
  confidence: number;
  modelAskedConfirmation: boolean;
  thresholdMinor: number;
  autoRecord: boolean;
  newParty: boolean;
  unknownProduct: boolean;
  fuzzyMatch: boolean;
}

export const AUTO_RECORD_TYPES = new Set(['sale', 'expense', 'income', 'purchase']);
export const MIN_AUTO_CONFIDENCE = 0.9;

export function evaluateRisk(r: RiskInput): { requiresConfirmation: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!r.autoRecord) reasons.push('auto_record_disabled');
  if (!AUTO_RECORD_TYPES.has(r.type)) reasons.push('sensitive_type');
  if (r.confidence < MIN_AUTO_CONFIDENCE) reasons.push('low_confidence');
  if (r.amountMinor > r.thresholdMinor) reasons.push('large_amount');
  if (r.modelAskedConfirmation) reasons.push('model_uncertain');
  if (r.newParty) reasons.push('new_contact');
  if (r.unknownProduct) reasons.push('unknown_product');
  if (r.fuzzyMatch) reasons.push('fuzzy_match');
  return { requiresConfirmation: reasons.length > 0, reasons };
}
