import { route } from "@/lib/api";
import { integrationCatalog } from "@/integrations/registry";

export const GET = route({}, async () => ({ integrations: integrationCatalog() }));
