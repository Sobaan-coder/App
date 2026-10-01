// POST /functions/v1/ai-process
// { business_id, text } | { business_id, mode: "receipt", storage_path }
// Returns a Proposal (action preview, clarification or answer). Never writes
// financial data: the client commits confirmed actions via record_transaction.
import { handleAI } from '../_shared/ai_handler.ts';
import { serve } from '../_shared/http.ts';

serve((req) => handleAI(req, { queryOnly: false }));
