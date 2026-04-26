// lib/embedding/chunking.ts
export interface Chunk {
  text: string;
  weight: number;
}

const CHARS_PER_TOKEN = 4;

export function approximateTokens(s: string): number {
  return Math.floor(s.length / CHARS_PER_TOKEN);
}

export function chunkBySection(markdown: string, maxTokens: number): Chunk[] {
  if (approximateTokens(markdown) <= maxTokens) {
    return [{ text: markdown, weight: markdown.length }];
  }

  const sections: string[] = [];
  const lines = markdown.split("\n");
  let buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## ") && buf.length > 0) {
      sections.push(buf.join("\n"));
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length > 0) sections.push(buf.join("\n"));

  const chunks: Chunk[] = [];
  for (const sec of sections) {
    if (approximateTokens(sec) <= maxTokens) {
      chunks.push({ text: sec, weight: sec.length });
    } else {
      const maxChars = maxTokens * CHARS_PER_TOKEN;
      chunks.push({ text: sec.slice(0, maxChars), weight: maxChars });
    }
  }
  return chunks;
}
