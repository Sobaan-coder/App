import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env.server";

/**
 * Embeddings via any OpenAI-compatible /embeddings endpoint.
 * When EMBEDDING_MODEL is unset, retrieval falls back to Postgres full-text
 * search only (still grounded, just less semantic).
 */
export function embeddingsEnabled() {
  return Boolean(serverEnv.embeddings.model && serverEnv.embeddings.apiKey);
}

let client: OpenAI | null = null;

export async function embed(texts: string[]): Promise<number[][]> {
  if (!embeddingsEnabled() || texts.length === 0) return [];
  client ??= new OpenAI({ apiKey: serverEnv.embeddings.apiKey, baseURL: serverEnv.embeddings.baseUrl });
  const { model, dimensions } = serverEnv.embeddings;
  const out: number[][] = [];
  // Batch to stay under request limits.
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const res = await client.embeddings.create({ model, input: batch, dimensions });
    for (const item of res.data.sort((a, b) => a.index - b.index)) {
      if (item.embedding.length !== dimensions) {
        throw new Error(`Embedding model returned ${item.embedding.length} dimensions; EMBEDDING_DIMENSIONS is ${dimensions}.`);
      }
      out.push(item.embedding);
    }
  }
  return out;
}

export async function embedOne(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  const [v] = await embed([text]);
  return v ?? null;
}

/** pgvector literal for RPC params / inserts. */
export function toVector(v: number[] | null | undefined): string | null {
  return v ? `[${v.join(",")}]` : null;
}
