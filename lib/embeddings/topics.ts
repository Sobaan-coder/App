import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed, embeddingsEnabled, toVector } from "@/lib/ai/embeddings";

/**
 * Embed topic names (with chapter + subject for context) so uploaded material
 * can be auto-linked to syllabus topics. No-op when embeddings are disabled.
 * Caller must have verified ownership of the subjects.
 */
export async function embedTopicsForSubjects(subjectIds: string[]) {
  if (!embeddingsEnabled() || subjectIds.length === 0) return;
  const admin = createAdminClient();
  const { data: topics } = await admin
    .from("topics")
    .select("id, name, description, chapters(name), subjects(name)")
    .in("subject_id", subjectIds)
    .is("embedding", null)
    .limit(1000);
  if (!topics?.length) return;
  const texts = topics.map((t) => {
    const ch = (t.chapters as { name: string } | null)?.name ?? "";
    const sub = (t.subjects as { name: string } | null)?.name ?? "";
    return `${sub} — ${ch} — ${t.name}${t.description ? `: ${t.description}` : ""}`;
  });
  const vectors = await embed(texts);
  await Promise.all(topics.map((t, i) => admin.from("topics").update({ embedding: toVector(vectors[i]) }).eq("id", t.id)));
}
