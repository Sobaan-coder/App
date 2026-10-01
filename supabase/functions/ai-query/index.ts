// POST /functions/v1/ai-query  { business_id, text }
// Question answering only (never proposes actions). Numbers come from SQL.
import { handleAI } from '../_shared/ai_handler.ts';
import { serve } from '../_shared/http.ts';

serve((req) => handleAI(req, { queryOnly: true }));
