// lib/run-id.ts
export function generateRunId(profileName: string, now: Date = new Date()): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  const utc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${utc}-${profileName}`;
}
