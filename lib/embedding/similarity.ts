// lib/embedding/similarity.ts
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("cosine: dimension mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function meanPairwise(vectors: number[][]): number {
  if (vectors.length < 2) throw new Error("meanPairwise: need ≥2 vectors");
  let sum = 0;
  let count = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sum += cosine(vectors[i]!, vectors[j]!);
      count += 1;
    }
  }
  return sum / count;
}
