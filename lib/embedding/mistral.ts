// lib/embedding/mistral.ts
export interface EmbedResponse {
  embeddings: number[][];
}

export async function mistralEmbed(input: string[], model = "mistral-embed"): Promise<EmbedResponse> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    throw new Error(`mistral embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return { embeddings: json.data.map((d) => d.embedding) };
}
