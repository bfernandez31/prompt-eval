// lib/eval/parsers/structured-list.ts

export function parseStructuredList(markdown: string, sectionName: string, decisionKey: string): string[] {
  const lines = markdown.split("\n");
  const sectionStart = lines.findIndex(
    (l) => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === sectionName,
  );
  if (sectionStart === -1) return [];

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      sectionEnd = i;
      break;
    }
  }

  const items: string[] = [];
  const re = new RegExp(`^-\\s+\\*\\*${escapeRe(decisionKey)}\\*\\*\\s*:\\s*(.+?)\\s*$`);
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const m = re.exec(lines[i]!);
    if (m) items.push(m[1]!);
  }
  return items;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
