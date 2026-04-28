// lib/eval/parsers/structured-list.ts

export function parseStructuredList(markdown: string, sectionName: string, decisionKey: string): string[] {
  const lines = markdown.split("\n");
  // Lenient heading match: accepts the canonical heading plus any parenthetical
  // suffix the model may have added (e.g. "Auto-Resolved Decisions *(mandatory
  // when policies apply)*"). The model sometimes drifts on heading wording even
  // when the section content is correct; stripping anything past the first
  // " (" or " *" gives us the bare section name to compare.
  const stripDecorations = (s: string) => s.replace(/^##\s+/, "").trim().replace(/\s*[(*].*$/, "").trim();
  const sectionStart = lines.findIndex(
    (l) => /^##\s+/.test(l) && stripDecorations(l) === sectionName,
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
