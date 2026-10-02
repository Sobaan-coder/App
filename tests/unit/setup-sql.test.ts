import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("supabase/setup.sql", () => {
  it("contains every migration verbatim, in order (run `npm run db:bundle` after changing migrations)", () => {
    const bundle = readFileSync("supabase/setup.sql", "utf8");
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    let from = 0;
    for (const f of files) {
      const at = bundle.indexOf(readFileSync(join("supabase/migrations", f), "utf8").trimEnd(), from);
      expect(at, `${f} missing or out of date in setup.sql`).toBeGreaterThanOrEqual(from);
      from = at;
    }
  });
});
