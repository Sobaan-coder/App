// supabase-js implementations of the resolver/query data interfaces.
// All calls run with the USER's JWT so tenant isolation is enforced by Postgres.

import { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { fromDbError } from './http.ts';
import { EntityMatch, ResolverDb } from './resolver.ts';
import { QueryDb } from './queries.ts';

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export function resolverDb(client: SupabaseClient, businessId: string): ResolverDb {
  return {
    matchEntities: (kind, names) =>
      rpc<EntityMatch[]>(client, 'match_entities', { p_business_id: businessId, p_kind: kind, p_names: names }),
  };
}

export function queryDb(client: SupabaseClient, businessId: string): QueryDb {
  const b = { p_business_id: businessId };
  return {
    dashboardSummary: (period) => rpc(client, 'dashboard_summary', { ...b, p_preset: period }),
    expenseBreakdown: (period) => rpc(client, 'expense_breakdown', { ...b, p_preset: period }),
    topProducts: (period, limit) => rpc(client, 'top_products', { ...b, p_preset: period, p_limit: limit }),
    lowStock: () => rpc(client, 'low_stock_products', b),
    spendOn: (term, period) => rpc(client, 'spend_on', { ...b, p_term: term, p_preset: period }),
    customerBalances: async (name) => {
      let q = client.from('customer_balances').select('name, outstanding_minor').eq('business_id', businessId)
        .order('outstanding_minor', { ascending: false }).limit(50);
      if (name) q = q.ilike('name', `%${name.replace(/[%_]/g, '')}%`);
      const { data, error } = await q;
      if (error) throw fromDbError(error);
      return data ?? [];
    },
    supplierBalances: async (name) => {
      let q = client.from('supplier_balances').select('name, outstanding_minor').eq('business_id', businessId)
        .order('outstanding_minor', { ascending: false }).limit(50);
      if (name) q = q.ilike('name', `%${name.replace(/[%_]/g, '')}%`);
      const { data, error } = await q;
      if (error) throw fromDbError(error);
      return data ?? [];
    },
    productStock: async (name) => {
      const { data, error } = await client.from('products').select('name, stock_quantity, unit')
        .eq('business_id', businessId).is('deleted_at', null).ilike('name', `%${name.replace(/[%_]/g, '')}%`).limit(5);
      if (error) throw fromDbError(error);
      return data ?? [];
    },
  };
}
