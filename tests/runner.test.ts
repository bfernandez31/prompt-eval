// tests/runner.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHeadless } from "../lib/runner";

describe("runHeadless", () => {
  test("parses stream-json result event for usage and cost", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "pe-fakeclaude-"));
    const fake = join(tmp, "claude");
    // Emit a realistic stream of JSON events: system init, assistant message,
    // and a final 'result' event with usage + total_cost_usd.
    await writeFile(
      fake,
      `#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"test"}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"working"}]}}'
echo '{"type":"result","subtype":"success","result":"ok","usage":{"input_tokens":10,"output_tokens":5},"total_cost_usd":0.01}'
`,
    );
    await chmod(fake, 0o755);

    const r = await runHeadless({
      claudePath: fake,
      cwd: tmp,
      invoke: "/foo",
      payload: "bar",
      timeoutMs: 5000,
    });
    expect(r.result).toBe("ok");
    expect(r.usage.input_tokens).toBe(10);
    expect(r.usage.output_tokens).toBe(5);
    expect(r.usage.cost_usd).toBeCloseTo(0.01, 6);
    await rm(tmp, { recursive: true });
  });

  test("rejects when no result event in stream", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "pe-noresult-"));
    const fake = join(tmp, "claude");
    await writeFile(
      fake,
      `#!/bin/sh
echo '{"type":"system","subtype":"init"}'
`,
    );
    await chmod(fake, 0o755);
    await expect(
      runHeadless({ claudePath: fake, cwd: tmp, invoke: "/foo", payload: "bar", timeoutMs: 5000 }),
    ).rejects.toThrow(/no 'result' event/);
    await rm(tmp, { recursive: true });
  });

  test("returns timeout when slow", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "pe-slow-"));
    const fake = join(tmp, "claude");
    await writeFile(fake, "#!/bin/sh\nsleep 3\n");
    await chmod(fake, 0o755);
    await expect(
      runHeadless({ claudePath: fake, cwd: tmp, invoke: "/x", payload: "y", timeoutMs: 200 }),
    ).rejects.toThrow(/timeout/i);
    await rm(tmp, { recursive: true });
  });
});
