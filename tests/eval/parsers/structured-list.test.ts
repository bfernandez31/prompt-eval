// tests/eval/parsers/structured-list.test.ts
import { describe, expect, test } from "bun:test";
import { parseStructuredList } from "../../../lib/eval/parsers/structured-list";

const sample = `# Spec

## Auto-Resolved Decisions

- **Decision summary**: Use cookie-based session
  - Policy applied: AUTO
  - Confidence: High (0.9)
  - Trade-offs: simplicity vs flexibility
  - Reviewer notes: revisit if oauth becomes mandatory

- **Decision summary**: Default retention 30 days
  - Policy applied: CONSERVATIVE
  - Confidence: Medium (0.6)

## Other Section

ignored
`;

describe("parseStructuredList", () => {
  test("extracts decisions from the named section", () => {
    const items = parseStructuredList(sample, "Auto-Resolved Decisions", "Decision summary");
    expect(items).toEqual([
      "Use cookie-based session",
      "Default retention 30 days",
    ]);
  });

  test("returns [] when section is missing", () => {
    expect(parseStructuredList("# Other", "Auto-Resolved Decisions", "Decision summary")).toEqual([]);
  });

  test("returns [] when key is missing within section", () => {
    const md = `## Auto-Resolved Decisions\n\n- **Other key**: foo\n`;
    expect(parseStructuredList(md, "Auto-Resolved Decisions", "Decision summary")).toEqual([]);
  });
});
