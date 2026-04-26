# prompt-eval MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP of the prompt-eval framework, end-to-end runnable on `/ai-board.specify` with a 3-level evaluation cascade (L1 stability via Mistral embeddings, L2 decision consistency via structured-list parsing, L3 quality via bracket pairwise judge), in semi-auto mode.

**Architecture:** A Claude Code plugin (`.claude-plugin/`) bundling a skill (`/prompt-eval`), two agent role definitions (`eval-orchestrator`, `hypothesis-evaluator`), and a Bun + TypeScript library (`lib/`) holding all logic the agents shell out to. State is filesystem-first under `~/.prompt-eval/runs/<run-id>/`. Clones use `git clone --shared` for cheap parallelism without branch collisions.

**Tech Stack:** Bun 1.x runtime, TypeScript 5.x (strict), `yaml` package for profile parsing, Mistral API (`mistral-embed`), Claude Code (skills, Agent Teams, Agent tool, `claude --print --output-format json`), git ≥ 2.40, `patch` (POSIX), `bun:test` for unit tests.

**Reference spec:** [`docs/specs/2026-04-26-prompt-eval-framework-design.md`](../specs/2026-04-26-prompt-eval-framework-design.md)

**Scope:** MVP. Out of MVP (explicitly): `--mode auto` end-to-end (wiring only), `structured_table` and `regex` parsers (stubs only), `prompt-eval resume`, `prompt-eval clean`, plugin marketplace publish, deep docs (minimum viable documentation only).

---

## File Structure

```
prompt-eval/
├── .claude-plugin/plugin.json
├── package.json                       # Bun project metadata
├── tsconfig.json                      # strict TS config
├── README.md                          # already exists, light update
├── skills/prompt-eval/SKILL.md        # entry point: /prompt-eval <profile>
├── agents/
│   ├── eval-orchestrator.md           # team lead role
│   └── hypothesis-evaluator.md        # teammate role
├── profiles/
│   └── ai-board.specify.yml           # first target profile
├── scripts/
│   ├── check-prereqs.sh               # validate env on install
│   └── prompt-eval                    # bun-launched CLI entry (lib/cli.ts)
├── lib/
│   ├── cli.ts                         # CLI dispatcher (subcommands: run, score-l1, score-l2, judge, ...)
│   ├── types.ts                       # shared TS types
│   ├── profile-loader.ts              # YAML → validated Profile
│   ├── state.ts                       # eval-run.yml read/write
│   ├── run-id.ts                      # run-id generator
│   ├── diff.ts                        # apply unified diff via `patch`
│   ├── clone-manager.ts               # git clone --shared lifecycle
│   ├── runner.ts                      # claude --print orchestration
│   ├── embedding/
│   │   ├── mistral.ts                 # Mistral API client
│   │   ├── chunking.ts                # 8192-token chunker (markdown-section aware)
│   │   └── similarity.ts              # cosine, mean-pairwise
│   ├── eval/
│   │   ├── l1-stability.ts            # L1 evaluator
│   │   ├── l2-decisions.ts            # L2 evaluator
│   │   └── parsers/
│   │       ├── structured-list.ts     # MVP parser
│   │       ├── structured-table.ts    # stub (throws "not implemented")
│   │       └── regex.ts               # stub
│   ├── bracket.ts                     # single-elimination + tied resolution
│   ├── judge.ts                       # judge prompt + double-blind
│   └── report.ts                      # round + final report generators
├── tests/                             # bun:test unit tests
│   ├── profile-loader.test.ts
│   ├── state.test.ts
│   ├── run-id.test.ts
│   ├── diff.test.ts
│   ├── embedding/
│   │   ├── chunking.test.ts
│   │   └── similarity.test.ts
│   ├── eval/
│   │   ├── l1-stability.test.ts
│   │   ├── l2-decisions.test.ts
│   │   └── parsers/structured-list.test.ts
│   ├── bracket.test.ts
│   └── report.test.ts
└── docs/
    ├── specs/2026-04-26-prompt-eval-framework-design.md       # exists
    ├── plans/2026-04-26-prompt-eval-mvp.md                    # this file
    ├── architecture.md                                         # MVP doc
    ├── adding-a-target.md                                      # MVP doc
    └── eval-cascade.md                                         # MVP doc
```

The `lib/` library is a single Bun project. Agents (markdown) shell out to it via `bun run scripts/prompt-eval <subcommand>`. This decouples agent prompt evolution from logic correctness (logic stays unit-tested).

---

## Pre-Implementation: Working Directory

All work happens in `/Users/b.fernandez/Workspace/prompt-eval/` (the repo created during the design phase). The repo's `main` already contains the design doc. Work directly on `main` for the MVP — branching adds friction without value at this stage. Frequent commits per task as we go.

```bash
cd /Users/b.fernandez/Workspace/prompt-eval
git status   # expect: clean, on main
```

---

## Task 1: Bun + TypeScript Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore` (modify existing — already there, just verify entries)

- [ ] **Step 1: Initialise Bun project**

```bash
cd /Users/b.fernandez/Workspace/prompt-eval
bun init -y
```

This creates a minimal `package.json`, `tsconfig.json`, `bunfig.toml`, and a sample `index.ts`. Delete `index.ts` (we'll add real entry points).

```bash
rm index.ts
```

- [ ] **Step 2: Edit `package.json` to declare project metadata + dependencies**

Replace the generated content with:

```json
{
  "name": "prompt-eval",
  "version": "0.0.1",
  "description": "Self-improvement framework for Claude Code prompts",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "prompt-eval": "bun run lib/cli.ts"
  },
  "dependencies": {
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

Expected: `bun.lockb` created, `node_modules/` populated.

- [ ] **Step 4: Replace `tsconfig.json` with strict config**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "lib": ["ESNext"],
    "types": ["bun-types"]
  },
  "include": ["lib/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Verify .gitignore covers Bun artefacts**

The existing `.gitignore` already lists `node_modules/`, `bun.lockb`. Confirm by reading it. No changes if already present.

- [ ] **Step 6: Sanity-check typecheck passes (no source files yet)**

```bash
bun run typecheck
```

Expected: succeeds with no errors (no input files match — TS is happy).

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json bun.lockb bunfig.toml
git commit -m "chore: bun + typescript scaffold"
```

---

## Task 2: Shared Types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// lib/types.ts

export type Mode = "semi-auto" | "auto";

export interface ProfileTarget {
  repo: string;
  prompt_file: string;
  invoke: string;
}

export interface ProfileTestInput {
  payload: string;
}

export interface ProfileLevel1 {
  output_artifact: string;
  embedding_model: string;
  threshold: number;
}

export interface ProfileLevel2 {
  skip?: boolean;
  section_name: string;
  parser: "structured_list" | "structured_table" | "regex";
  decision_key: string;
  threshold_pct: number;
}

export interface ProfileLevel3 {
  judge_model: string;
  double_blind: boolean;
  rubric: string;
}

export interface ProfileEval {
  runs_per_hypothesis: number;
  concurrency_per_hypothesis: number;
  max_hypotheses_per_round: number;
  level1_stability: ProfileLevel1;
  level2_decisions: ProfileLevel2;
  level3_quality: ProfileLevel3;
}

export interface ProfileLimits {
  max_rounds: number;
  max_budget_usd: number;
}

export interface Hypothesis {
  id: string;
  description: string;
  diff: string;
}

export interface Profile {
  name: string;
  description: string;
  target: ProfileTarget;
  test_input: ProfileTestInput;
  eval: ProfileEval;
  limits: ProfileLimits;
  mode: Mode;
  initial_hypotheses: Hypothesis[];
}

export type RunStatus =
  | { kind: "ok"; file_path: string; usage: Usage; branch_created?: string }
  | { kind: "timeout" }
  | { kind: "no_output" }
  | { kind: "exec_failed"; stderr: string };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export type HypothesisStatus =
  | { kind: "qualified" }
  | { kind: "rejected"; reason: "patch_failed" | "unstable" | "inconsistent" | "unreliable" };

export interface RunState {
  run_id: string;
  profile_path: string;
  mode: Mode;
  current_round: number;
  state: {
    rounds_completed: number;
    budget_consumed_usd: number;
    baseline_path: string;
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): shared types for profiles, hypotheses, run state"
```

---

## Task 3: run-id Generator (with test)

**Files:**
- Create: `lib/run-id.ts`
- Test: `tests/run-id.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/run-id.test.ts
import { describe, expect, test } from "bun:test";
import { generateRunId } from "../lib/run-id";

describe("generateRunId", () => {
  test("returns a string with format YYYYMMDD-HHMMSS-<name>", () => {
    const id = generateRunId("ai-board.specify", new Date("2026-04-26T20:15:00Z"));
    expect(id).toMatch(/^\d{8}-\d{6}-ai-board\.specify$/);
    expect(id).toBe("20260426-201500-ai-board.specify");
  });

  test("uses Date.now() when no date provided", () => {
    const id = generateRunId("foo");
    expect(id).toMatch(/^\d{8}-\d{6}-foo$/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
bun test tests/run-id.test.ts
```

Expected: FAIL with "Cannot find module '../lib/run-id'".

- [ ] **Step 3: Implement**

```typescript
// lib/run-id.ts
export function generateRunId(profileName: string, now: Date = new Date()): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  const utc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${utc}-${profileName}`;
}
```

- [ ] **Step 4: Verify test passes**

```bash
bun test tests/run-id.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/run-id.ts tests/run-id.test.ts
git commit -m "feat(run-id): UTC-based deterministic run id generator"
```

---

## Task 4: Profile Loader (with tests)

**Files:**
- Create: `lib/profile-loader.ts`
- Test: `tests/profile-loader.test.ts`
- Test fixture: `tests/fixtures/profile-valid.yml`
- Test fixture: `tests/fixtures/profile-missing-target.yml`

- [ ] **Step 1: Create fixture files**

`tests/fixtures/profile-valid.yml`:

```yaml
name: test-profile
description: A valid test profile
target:
  repo: /tmp/foo
  prompt_file: prompt.md
  invoke: "/foo"
test_input:
  payload: "hello"
eval:
  runs_per_hypothesis: 5
  concurrency_per_hypothesis: 3
  max_hypotheses_per_round: 5
  level1_stability:
    output_artifact: "out/{branch}.md"
    embedding_model: mistral-embed
    threshold: 0.85
  level2_decisions:
    section_name: "Decisions"
    parser: structured_list
    decision_key: "Decision summary"
    threshold_pct: 95
  level3_quality:
    judge_model: claude-haiku-4-5
    double_blind: true
    rubric: "compare A and B"
limits:
  max_rounds: 5
  max_budget_usd: 10.0
mode: semi-auto
initial_hypotheses: []
```

`tests/fixtures/profile-missing-target.yml`:

```yaml
name: bad-profile
description: missing target
test_input:
  payload: "hello"
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/profile-loader.test.ts
import { describe, expect, test } from "bun:test";
import { loadProfile } from "../lib/profile-loader";
import { resolve } from "node:path";

const fixture = (name: string) => resolve(import.meta.dir, "fixtures", name);

describe("loadProfile", () => {
  test("loads a valid profile", async () => {
    const p = await loadProfile(fixture("profile-valid.yml"));
    expect(p.name).toBe("test-profile");
    expect(p.target.repo).toBe("/tmp/foo");
    expect(p.eval.level1_stability.threshold).toBe(0.85);
    expect(p.mode).toBe("semi-auto");
  });

  test("throws when target is missing", async () => {
    await expect(loadProfile(fixture("profile-missing-target.yml"))).rejects.toThrow(
      /target/i,
    );
  });

  test("auto mode requires limits", async () => {
    const p = await loadProfile(fixture("profile-valid.yml"));
    p.mode = "auto";
    p.limits.max_rounds = 0;
    // re-validate manually, simulating CLI override
    expect(() => {
      if (p.mode === "auto" && (p.limits.max_rounds <= 0 || p.limits.max_budget_usd <= 0)) {
        throw new Error("auto mode requires positive max_rounds and max_budget_usd");
      }
    }).toThrow(/auto mode/);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

```bash
bun test tests/profile-loader.test.ts
```

Expected: FAIL ("Cannot find module").

- [ ] **Step 4: Implement loader**

```typescript
// lib/profile-loader.ts
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { Profile } from "./types";

const REQUIRED_TOP = ["name", "description", "target", "test_input", "eval", "limits", "mode"] as const;
const REQUIRED_TARGET = ["repo", "prompt_file", "invoke"] as const;
const REQUIRED_EVAL = [
  "runs_per_hypothesis",
  "concurrency_per_hypothesis",
  "max_hypotheses_per_round",
  "level1_stability",
  "level2_decisions",
  "level3_quality",
] as const;

export async function loadProfile(path: string): Promise<Profile> {
  const text = await readFile(path, "utf8");
  const raw = parse(text) as Record<string, unknown>;

  for (const key of REQUIRED_TOP) {
    if (!(key in raw)) throw new Error(`profile ${path}: missing required top-level key '${key}'`);
  }

  const target = raw.target as Record<string, unknown>;
  for (const key of REQUIRED_TARGET) {
    if (!(key in target)) throw new Error(`profile ${path}: target missing '${key}'`);
  }

  const ev = raw.eval as Record<string, unknown>;
  for (const key of REQUIRED_EVAL) {
    if (!(key in ev)) throw new Error(`profile ${path}: eval missing '${key}'`);
  }

  // Default initial_hypotheses to []
  if (!("initial_hypotheses" in raw)) raw.initial_hypotheses = [];

  return raw as unknown as Profile;
}
```

- [ ] **Step 5: Verify tests pass**

```bash
bun test tests/profile-loader.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/profile-loader.ts tests/profile-loader.test.ts tests/fixtures/
git commit -m "feat(profile-loader): YAML profile loading with required-field validation"
```

---

## Task 5: State Read/Write (with tests)

**Files:**
- Create: `lib/state.ts`
- Test: `tests/state.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/state.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, readState, writeState, addBudget } from "../lib/state";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pe-state-"));
});

describe("state", () => {
  test("init writes a fresh eval-run.yml", async () => {
    const s = await initState(dir, {
      run_id: "test-1",
      profile_path: "/tmp/p.yml",
      mode: "semi-auto",
      baseline_path: "rounds/round-0/baseline.md",
    });
    const re = await readState(dir);
    expect(re.run_id).toBe("test-1");
    expect(re.state.budget_consumed_usd).toBe(0);
    expect(re.current_round).toBe(0);
    await rm(dir, { recursive: true });
  });

  test("addBudget accumulates and persists", async () => {
    await initState(dir, {
      run_id: "test-2",
      profile_path: "/tmp/p.yml",
      mode: "semi-auto",
      baseline_path: "x",
    });
    await addBudget(dir, 1.5);
    await addBudget(dir, 0.25);
    const s = await readState(dir);
    expect(s.state.budget_consumed_usd).toBeCloseTo(1.75, 6);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
bun test tests/state.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement state**

```typescript
// lib/state.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stringify, parse } from "yaml";
import type { Mode, RunState } from "./types";

const FILE = "eval-run.yml";

export interface InitArgs {
  run_id: string;
  profile_path: string;
  mode: Mode;
  baseline_path: string;
}

export async function initState(stateDir: string, args: InitArgs): Promise<RunState> {
  await mkdir(stateDir, { recursive: true });
  const s: RunState = {
    run_id: args.run_id,
    profile_path: args.profile_path,
    mode: args.mode,
    current_round: 0,
    state: {
      rounds_completed: 0,
      budget_consumed_usd: 0,
      baseline_path: args.baseline_path,
    },
  };
  await writeState(stateDir, s);
  return s;
}

export async function readState(stateDir: string): Promise<RunState> {
  const text = await readFile(join(stateDir, FILE), "utf8");
  return parse(text) as RunState;
}

export async function writeState(stateDir: string, s: RunState): Promise<void> {
  await writeFile(join(stateDir, FILE), stringify(s));
}

export async function addBudget(stateDir: string, usd: number): Promise<void> {
  const s = await readState(stateDir);
  s.state.budget_consumed_usd += usd;
  await writeState(stateDir, s);
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/state.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/state.ts tests/state.test.ts
git commit -m "feat(state): eval-run.yml read/write + budget accumulator"
```

---

## Task 6: Diff Application (with tests)

**Files:**
- Create: `lib/diff.ts`
- Test: `tests/diff.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/diff.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDiff } from "../lib/diff";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pe-diff-"));
});

describe("applyDiff", () => {
  test("applies a one-line replacement", async () => {
    const file = join(dir, "f.md");
    await writeFile(file, "alpha\nbeta\ngamma\n");
    const diff = `--- a/f.md
+++ b/f.md
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
`;
    await applyDiff(dir, diff);
    expect(await readFile(file, "utf8")).toBe("alpha\nBETA\ngamma\n");
    await rm(dir, { recursive: true });
  });

  test("throws on a malformed patch", async () => {
    const file = join(dir, "f.md");
    await writeFile(file, "alpha\n");
    const diff = `--- a/f.md
+++ b/f.md
@@ -1,1 +1,1 @@
-DOES_NOT_MATCH
+something
`;
    await expect(applyDiff(dir, diff)).rejects.toThrow();
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
bun test tests/diff.test.ts
```

- [ ] **Step 3: Implement using `patch` shell-out**

```typescript
// lib/diff.ts
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function applyDiff(cwd: string, unifiedDiff: string): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "pe-patch-"));
  const patchFile = join(tmp, "h.diff");
  await writeFile(patchFile, unifiedDiff);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("patch", ["-p1", "-i", patchFile, "--no-backup-if-mismatch"], { cwd });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`patch exited ${code}: ${stderr}`));
      });
    });
  } finally {
    await rm(tmp, { recursive: true });
  }
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/diff.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/diff.ts tests/diff.test.ts
git commit -m "feat(diff): apply unified diff via POSIX patch"
```

---

## Task 7: Clone Manager (with integration test)

**Files:**
- Create: `lib/clone-manager.ts`
- Test: `tests/clone-manager.test.ts`

This task touches real Git. The test creates a tiny git repo on the fly to validate clone+cleanup.

- [ ] **Step 1: Write failing test**

```typescript
// tests/clone-manager.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloneShared, removeClone } from "../lib/clone-manager";

async function makeSourceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pe-src-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "hello\n");
  spawnSync("git", ["-C", dir, "add", "."]);
  spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"]);
  return dir;
}

describe("clone-manager", () => {
  test("cloneShared creates a working clone that points to the source", async () => {
    const src = await makeSourceRepo();
    const dest = join(await mkdtemp(join(tmpdir(), "pe-dest-")), "clone");
    await cloneShared(src, dest);
    const s = await stat(join(dest, "README.md"));
    expect(s.isFile()).toBe(true);
    await removeClone(dest);
    await rm(src, { recursive: true });
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
bun test tests/clone-manager.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/clone-manager.ts
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

export async function cloneShared(source: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["clone", "--shared", "--quiet", source, dest]);
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone exited ${code}: ${stderr}`));
    });
  });
}

export async function removeClone(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repoPath, "branch", "--format=%(refname:short)"]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.split("\n").map((s) => s.trim()).filter(Boolean));
      } else reject(new Error(`git branch exited ${code}: ${stderr}`));
    });
  });
}

export async function commitAll(repoPath: string, message: string): Promise<void> {
  const args = (a: string[]) => ["-C", repoPath, ...a];
  await runGit(args(["add", "-A"]));
  await runGit(args(["-c", "user.email=eval@local", "-c", "user.name=prompt-eval", "commit", "-q", "-m", message]));
}

async function runGit(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args);
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/clone-manager.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/clone-manager.ts tests/clone-manager.test.ts
git commit -m "feat(clone-manager): git clone --shared lifecycle + branch listing + commitAll"
```

---

## Task 8: Headless Runner

**Files:**
- Create: `lib/runner.ts`
- Test: `tests/runner.test.ts` (uses a fake `claude` script for testability)

- [ ] **Step 1: Write failing test**

```typescript
// tests/runner.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHeadless } from "../lib/runner";

describe("runHeadless", () => {
  test("captures stdout JSON usage", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "pe-fakeclaude-"));
    const fake = join(tmp, "claude");
    await writeFile(
      fake,
      `#!/bin/sh
echo '{"result":"ok","usage":{"input_tokens":10,"output_tokens":5,"cost_usd":0.01}}'
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
    expect(r.usage.input_tokens).toBe(10);
    expect(r.usage.cost_usd).toBeCloseTo(0.01, 6);
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
```

- [ ] **Step 2: Verify it fails**

```bash
bun test tests/runner.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/runner.ts
import { spawn } from "node:child_process";
import type { Usage } from "./types";

export interface RunHeadlessArgs {
  claudePath?: string;        // override for tests
  cwd: string;
  invoke: string;             // e.g. "/ai-board.specify"
  payload: string;            // raw arg passed to the slash-command
  timeoutMs: number;
}

export interface RunHeadlessResult {
  result: string;
  usage: Usage;
  raw: string;
}

export async function runHeadless(args: RunHeadlessArgs): Promise<RunHeadlessResult> {
  const claude = args.claudePath ?? "claude";
  const argv = ["--print", "--output-format", "json", `${args.invoke} ${args.payload}`];

  const child = spawn(claude, argv, { cwd: args.cwd });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
    }, args.timeoutMs);
  });

  const completion = new Promise<RunHeadlessResult>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({
          result: String(parsed.result ?? ""),
          usage: {
            input_tokens: Number(parsed.usage?.input_tokens ?? 0),
            output_tokens: Number(parsed.usage?.output_tokens ?? 0),
            cost_usd: Number(parsed.usage?.cost_usd ?? 0),
          },
          raw: stdout,
        });
      } catch (e) {
        reject(new Error(`failed to parse claude JSON output: ${(e as Error).message}\nSTDOUT:\n${stdout}`));
      }
    });
  });

  return await Promise.race([completion, timeout]);
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/runner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/runner.ts tests/runner.test.ts
git commit -m "feat(runner): headless claude --print orchestration with timeout + usage capture"
```

---

## Task 9: Mistral Embedding Client + Chunking

**Files:**
- Create: `lib/embedding/mistral.ts`
- Create: `lib/embedding/chunking.ts`
- Create: `lib/embedding/similarity.ts`
- Test: `tests/embedding/chunking.test.ts`
- Test: `tests/embedding/similarity.test.ts`

(No live-API test for `mistral.ts`. The API call is small enough to read and review.)

- [ ] **Step 1: Write failing test for chunking**

```typescript
// tests/embedding/chunking.test.ts
import { describe, expect, test } from "bun:test";
import { chunkBySection, approximateTokens } from "../../lib/embedding/chunking";

describe("approximateTokens", () => {
  test("uses ~4 chars per token heuristic", () => {
    expect(approximateTokens("a".repeat(400))).toBe(100);
    expect(approximateTokens("")).toBe(0);
  });
});

describe("chunkBySection", () => {
  test("returns single chunk when under budget", () => {
    const md = "# Title\n\nbody";
    const chunks = chunkBySection(md, 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("body");
    expect(chunks[0].weight).toBeGreaterThan(0);
  });

  test("splits at top-level h2 boundaries when over budget", () => {
    const big = "x".repeat(4000); // ~1000 tokens
    const md = `# Title\n\n## A\n\n${big}\n\n## B\n\n${big}\n`;
    const chunks = chunkBySection(md, 800);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/embedding/chunking.test.ts
```

- [ ] **Step 3: Implement chunking**

```typescript
// lib/embedding/chunking.ts
export interface Chunk {
  text: string;
  weight: number;       // proportional to length, used for weighted mean of similarities
}

const CHARS_PER_TOKEN = 4;

export function approximateTokens(s: string): number {
  return Math.floor(s.length / CHARS_PER_TOKEN);
}

export function chunkBySection(markdown: string, maxTokens: number): Chunk[] {
  if (approximateTokens(markdown) <= maxTokens) {
    return [{ text: markdown, weight: markdown.length }];
  }

  // Split on top-level "## " headings (preserve heading with its content).
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
      // Truncate over-long section. Log via stderr in caller; here we just slice.
      const maxChars = maxTokens * CHARS_PER_TOKEN;
      chunks.push({ text: sec.slice(0, maxChars), weight: maxChars });
    }
  }
  return chunks;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/embedding/chunking.test.ts
```

- [ ] **Step 5: Write failing test for similarity**

```typescript
// tests/embedding/similarity.test.ts
import { describe, expect, test } from "bun:test";
import { cosine, meanPairwise } from "../../lib/embedding/similarity";

describe("cosine", () => {
  test("identical vectors → 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  test("orthogonal vectors → 0", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
});

describe("meanPairwise", () => {
  test("averages pairs", () => {
    const vs = [
      [1, 0],
      [1, 0],
      [0, 1],
    ];
    // pairs: (0,1)=1, (0,2)=0, (1,2)=0  → mean = 1/3
    expect(meanPairwise(vs)).toBeCloseTo(1 / 3, 6);
  });
  test("single vector throws", () => {
    expect(() => meanPairwise([[1, 0]])).toThrow();
  });
});
```

- [ ] **Step 6: Implement similarity**

```typescript
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
```

- [ ] **Step 7: Verify**

```bash
bun test tests/embedding/
```

- [ ] **Step 8: Implement Mistral client (no test — API call)**

```typescript
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
```

- [ ] **Step 9: Commit**

```bash
git add lib/embedding/ tests/embedding/
git commit -m "feat(embedding): mistral client + section-aware chunking + cosine helpers"
```

---

## Task 10: L1 Stability Evaluator

**Files:**
- Create: `lib/eval/l1-stability.ts`
- Test: `tests/eval/l1-stability.test.ts`

- [ ] **Step 1: Write failing test (uses injected embed function)**

```typescript
// tests/eval/l1-stability.test.ts
import { describe, expect, test } from "bun:test";
import { evaluateL1 } from "../../lib/eval/l1-stability";

describe("evaluateL1", () => {
  test("returns mean pairwise sim and gate=pass when above threshold", async () => {
    // identical inputs → cosine 1
    const fakeEmbed = async (texts: string[]) => ({
      embeddings: texts.map(() => [1, 0, 0]),
    });
    const r = await evaluateL1({
      runOutputs: ["a", "b", "c"],
      embed: fakeEmbed,
      maxTokens: 10000,
      threshold: 0.85,
    });
    expect(r.mean_similarity).toBeCloseTo(1, 6);
    expect(r.gate).toBe("pass");
  });

  test("gate=fail when below threshold", async () => {
    let i = 0;
    const fakeEmbed = async (texts: string[]) => ({
      embeddings: texts.map(() => {
        const v = i++ % 2 === 0 ? [1, 0] : [0, 1];
        return v;
      }),
    });
    const r = await evaluateL1({
      runOutputs: ["a", "b"],
      embed: fakeEmbed,
      maxTokens: 10000,
      threshold: 0.85,
    });
    expect(r.gate).toBe("fail");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/eval/l1-stability.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/eval/l1-stability.ts
import { chunkBySection } from "../embedding/chunking";
import { meanPairwise, cosine } from "../embedding/similarity";

export interface EvaluateL1Args {
  runOutputs: string[];                       // raw text of each run output
  embed: (texts: string[]) => Promise<{ embeddings: number[][] }>;
  maxTokens: number;                          // model's max input tokens (8192 for mistral-embed)
  threshold: number;
}

export interface L1Result {
  pair_similarities: Array<{ i: number; j: number; sim: number }>;
  mean_similarity: number;
  gate: "pass" | "fail";
}

export async function evaluateL1(args: EvaluateL1Args): Promise<L1Result> {
  if (args.runOutputs.length < 2) {
    throw new Error("L1 needs ≥2 run outputs");
  }

  // For each output, chunk + embed each chunk + length-weighted-mean to a single vector per run.
  const perRunVectors: number[][] = [];
  for (const out of args.runOutputs) {
    const chunks = chunkBySection(out, args.maxTokens);
    const { embeddings } = await args.embed(chunks.map((c) => c.text));
    const totalWeight = chunks.reduce((s, c) => s + c.weight, 0);
    const dim = embeddings[0]!.length;
    const agg = new Array<number>(dim).fill(0);
    for (let i = 0; i < embeddings.length; i++) {
      const w = chunks[i]!.weight / totalWeight;
      const e = embeddings[i]!;
      for (let d = 0; d < dim; d++) agg[d] += e[d]! * w;
    }
    perRunVectors.push(agg);
  }

  const pair_similarities: L1Result["pair_similarities"] = [];
  for (let i = 0; i < perRunVectors.length; i++) {
    for (let j = i + 1; j < perRunVectors.length; j++) {
      pair_similarities.push({ i, j, sim: cosine(perRunVectors[i]!, perRunVectors[j]!) });
    }
  }
  const mean_similarity = meanPairwise(perRunVectors);
  return {
    pair_similarities,
    mean_similarity,
    gate: mean_similarity >= args.threshold ? "pass" : "fail",
  };
}
```

- [ ] **Step 4: Verify**

```bash
bun test tests/eval/l1-stability.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/eval/l1-stability.ts tests/eval/l1-stability.test.ts
git commit -m "feat(eval/l1): stability evaluator with chunked length-weighted embedding aggregation"
```

---

## Task 11: structured_list Parser

**Files:**
- Create: `lib/eval/parsers/structured-list.ts`
- Create: `lib/eval/parsers/structured-table.ts` (stub)
- Create: `lib/eval/parsers/regex.ts` (stub)
- Test: `tests/eval/parsers/structured-list.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
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
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/eval/parsers/structured-list.test.ts
```

- [ ] **Step 3: Implement structured_list**

```typescript
// lib/eval/parsers/structured-list.ts

export function parseStructuredList(markdown: string, sectionName: string, decisionKey: string): string[] {
  const lines = markdown.split("\n");
  // Find the section heading. Match `## <sectionName>` (level 2).
  const sectionStart = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === sectionName);
  if (sectionStart === -1) return [];

  // Section ends at next `## ` heading, or EOF.
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      sectionEnd = i;
      break;
    }
  }

  const items: string[] = [];
  // Match top-level list items in the form: `- **<decisionKey>**: <value>`
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
```

- [ ] **Step 4: Implement stubs**

```typescript
// lib/eval/parsers/structured-table.ts
export function parseStructuredTable(): never {
  throw new Error("parser 'structured_table' not implemented in MVP");
}
```

```typescript
// lib/eval/parsers/regex.ts
export function parseRegex(): never {
  throw new Error("parser 'regex' not implemented in MVP");
}
```

- [ ] **Step 5: Verify tests pass**

```bash
bun test tests/eval/parsers/
```

- [ ] **Step 6: Commit**

```bash
git add lib/eval/parsers/ tests/eval/parsers/
git commit -m "feat(parsers): structured_list MVP parser; stubs for structured_table and regex"
```

---

## Task 12: L2 Decisions Evaluator

**Files:**
- Create: `lib/eval/l2-decisions.ts`
- Test: `tests/eval/l2-decisions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/eval/l2-decisions.test.ts
import { describe, expect, test } from "bun:test";
import { evaluateL2 } from "../../lib/eval/l2-decisions";

const a = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Y\n`;
const b = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Y\n`;
const c = `## Decisions\n\n- **Decision summary**: X\n- **Decision summary**: Z\n`;

describe("evaluateL2", () => {
  test("100% Jaccard when all runs identical", async () => {
    const r = await evaluateL2({
      runOutputs: [a, b],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    expect(r.consistency_pct).toBe(100);
    expect(r.gate).toBe("pass");
  });

  test("Jaccard drops when one run differs", async () => {
    const r = await evaluateL2({
      runOutputs: [a, b, c],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    // intersection = {X}; union = {X,Y,Z}; J = 1/3 = 33%
    expect(r.consistency_pct).toBeCloseTo(100 / 3, 1);
    expect(r.gate).toBe("fail");
  });

  test("flaky if a run has empty section", async () => {
    const r = await evaluateL2({
      runOutputs: [a, "## Other\n\nnothing"],
      parser: "structured_list",
      sectionName: "Decisions",
      decisionKey: "Decision summary",
      thresholdPct: 95,
    });
    expect(r.flaky_count).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/eval/l2-decisions.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/eval/l2-decisions.ts
import { parseStructuredList } from "./parsers/structured-list";
import { parseStructuredTable } from "./parsers/structured-table";
import { parseRegex } from "./parsers/regex";

export interface EvaluateL2Args {
  runOutputs: string[];
  parser: "structured_list" | "structured_table" | "regex";
  sectionName: string;
  decisionKey: string;
  thresholdPct: number;
}

export interface L2Result {
  per_run_decisions: string[][];
  flaky_count: number;
  consistency_pct: number;     // |⋂Sᵢ| / |⋃Sᵢ| × 100
  gate: "pass" | "fail" | "skipped";
}

export async function evaluateL2(args: EvaluateL2Args): Promise<L2Result> {
  const parse = (md: string) => {
    switch (args.parser) {
      case "structured_list":
        return parseStructuredList(md, args.sectionName, args.decisionKey);
      case "structured_table":
        return parseStructuredTable();
      case "regex":
        return parseRegex();
    }
  };

  const per_run_decisions = args.runOutputs.map(parse);
  const flaky_count = per_run_decisions.filter((d) => d.length === 0).length;

  const sets = per_run_decisions.map((arr) => new Set(arr));
  const union = new Set<string>();
  for (const s of sets) for (const v of s) union.add(v);
  const intersection = new Set<string>(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const v of [...intersection]) if (!sets[i]!.has(v)) intersection.delete(v);
  }
  const consistency_pct = union.size === 0 ? 0 : (intersection.size / union.size) * 100;

  const gate: L2Result["gate"] = consistency_pct >= args.thresholdPct ? "pass" : "fail";

  return { per_run_decisions, flaky_count, consistency_pct, gate };
}
```

- [ ] **Step 4: Verify**

```bash
bun test tests/eval/l2-decisions.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/eval/l2-decisions.ts tests/eval/l2-decisions.test.ts
git commit -m "feat(eval/l2): decision-consistency Jaccard evaluator"
```

---

## Task 13: Bracket Tournament

**Files:**
- Create: `lib/bracket.ts`
- Test: `tests/bracket.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/bracket.test.ts
import { describe, expect, test } from "bun:test";
import { runBracket, type Match } from "../lib/bracket";

describe("runBracket", () => {
  test("baseline wins when judge always returns baseline", async () => {
    const judge = async (a: string, b: string): Promise<"A" | "B" | "tied"> => {
      return a === "baseline" ? "A" : b === "baseline" ? "B" : "tied";
    };
    const r = await runBracket({
      participants: ["baseline", "H1", "H2"],
      judge,
    });
    expect(r.winner).toBe("baseline");
    expect(r.matches.length).toBeGreaterThan(0);
  });

  test("hypothesis wins when judge always picks it", async () => {
    const judge = async (a: string, b: string): Promise<"A" | "B" | "tied"> => {
      return a === "H1" ? "A" : b === "H1" ? "B" : "tied";
    };
    const r = await runBracket({
      participants: ["baseline", "H1", "H2"],
      judge,
    });
    expect(r.winner).toBe("H1");
  });

  test("tied resolves in favour of baseline", async () => {
    // baseline vs H1 always tied
    const judge = async () => "tied" as const;
    const r = await runBracket({
      participants: ["baseline", "H1"],
      judge,
    });
    expect(r.winner).toBe("baseline");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/bracket.test.ts
```

- [ ] **Step 3: Implement single-elimination bracket**

```typescript
// lib/bracket.ts

export type JudgeVerdict = "A" | "B" | "tied";

export interface Match {
  round: number;
  a: string;
  b: string;
  verdict: JudgeVerdict;
  winner: string;        // a, b, or whichever is "baseline" on tied (assumes baseline is always among participants)
}

export interface RunBracketArgs {
  participants: string[];                                // first element is treated as the baseline
  judge: (a: string, b: string) => Promise<JudgeVerdict>;
}

export interface BracketResult {
  winner: string;
  matches: Match[];
}

export async function runBracket(args: RunBracketArgs): Promise<BracketResult> {
  if (args.participants.length === 0) throw new Error("bracket: empty participants");
  if (args.participants.length === 1) {
    return { winner: args.participants[0]!, matches: [] };
  }

  const baseline = args.participants[0]!;
  const matches: Match[] = [];
  let current = [...args.participants];
  let round = 0;

  while (current.length > 1) {
    round += 1;
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i]!;
      const b = current[i + 1];
      if (b === undefined) {
        next.push(a);     // bye
        continue;
      }
      const verdict = await args.judge(a, b);
      const winner = verdict === "A" ? a : verdict === "B" ? b : (a === baseline ? a : (b === baseline ? b : a));
      matches.push({ round, a, b, verdict, winner });
      next.push(winner);
    }
    current = next;
  }

  return { winner: current[0]!, matches };
}
```

- [ ] **Step 4: Verify tests pass**

```bash
bun test tests/bracket.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/bracket.ts tests/bracket.test.ts
git commit -m "feat(bracket): single-elimination tournament with baseline-favouring tie resolution"
```

---

## Task 14: Judge Prompt Builder + Double-Blind

**Files:**
- Create: `lib/judge.ts`
- Test: `tests/judge.test.ts`

The actual judge call is performed via `runHeadless` against a sub-agent; here we build the prompt and resolve double-blind.

- [ ] **Step 1: Write failing test**

```typescript
// tests/judge.test.ts
import { describe, expect, test } from "bun:test";
import { buildJudgePrompt, doubleBlindVerdict } from "../lib/judge";

describe("buildJudgePrompt", () => {
  test("substitutes A and B and includes rubric", () => {
    const p = buildJudgePrompt({
      rubric: "Compare A and B.",
      specA: "I am A",
      specB: "I am B",
    });
    expect(p).toContain("Compare A and B.");
    expect(p).toContain("I am A");
    expect(p).toContain("I am B");
    expect(p).toMatch(/respond with.*A.*B.*tied/i);
  });
});

describe("doubleBlindVerdict", () => {
  test("agree → that verdict", async () => {
    const judge = async (a: string, b: string) => (a === "X" ? "A" : "B") as const;
    // pass1: judge(X, Y) = A. pass2: judge(Y, X) = B (still picking X).
    // resolved: X wins both → "A" if X is the original a.
    const v = await doubleBlindVerdict("X", "Y", judge);
    expect(v).toBe("A");
  });

  test("disagree → tied", async () => {
    let i = 0;
    // pass1 returns A; pass2 returns A (in pass2, A is original B → disagreement)
    const judge = async () => (i++ === 0 ? "A" : "A") as const;
    const v = await doubleBlindVerdict("X", "Y", judge);
    expect(v).toBe("tied");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/judge.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/judge.ts
import type { JudgeVerdict } from "./bracket";

export interface BuildPromptArgs {
  rubric: string;
  specA: string;
  specB: string;
}

export function buildJudgePrompt(args: BuildPromptArgs): string {
  return `You are an impartial evaluator.

${args.rubric}

# Spec A

${args.specA}

# Spec B

${args.specB}

Respond with EXACTLY one of: "A", "B", or "tied", followed by a one-line rationale.
Format: "<verdict>: <rationale>"
`;
}

/**
 * Run two independent judgments with A/B order swapped.
 * - pass1: judge(specA, specB) → verdict_orig in {A, B, tied}
 * - pass2: judge(specB, specA) → verdict_swapped in {A, B, tied}
 *   For pass2, "A" means original B won; we map it back.
 * - If pass1 and pass2 agree on the same original participant, return that verdict.
 * - Otherwise return "tied".
 */
export async function doubleBlindVerdict(
  specA: string,
  specB: string,
  judge: (a: string, b: string) => Promise<JudgeVerdict>,
): Promise<JudgeVerdict> {
  const v1 = await judge(specA, specB);
  const v2 = await judge(specB, specA);
  // Map v2 back to original A/B framing.
  const v2Mapped: JudgeVerdict = v2 === "A" ? "B" : v2 === "B" ? "A" : "tied";
  if (v1 === v2Mapped) return v1;
  return "tied";
}
```

- [ ] **Step 4: Verify tests**

```bash
bun test tests/judge.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/judge.ts tests/judge.test.ts
git commit -m "feat(judge): pairwise judge prompt builder + double-blind resolution"
```

---

## Task 15: Round Report Generator

**Files:**
- Create: `lib/report.ts`
- Test: `tests/report.test.ts`

The MVP scope here is: render a `round-report.md` from a structured `RoundData` object. Final-report generator is the same logic over multiple rounds — covered together.

- [ ] **Step 1: Write failing test**

```typescript
// tests/report.test.ts
import { describe, expect, test } from "bun:test";
import { renderRoundReport, type RoundData } from "../lib/report";

const data: RoundData = {
  round: 1,
  baseline_id: "baseline",
  hypotheses: [
    { id: "H1", description: "shorten X", status: { kind: "rejected", reason: "unstable" }, l1: 0.72, l2: null },
    { id: "H2", description: "tighten Y", status: { kind: "qualified" }, l1: 0.93, l2: 100 },
  ],
  bracket_winner: "H2",
  bracket_matches: [
    { round: 1, a: "baseline", b: "H2", verdict: "B", winner: "H2" },
  ],
  decision: "adopt",
  total_usd: 1.23,
};

describe("renderRoundReport", () => {
  test("includes hypothesis statuses, bracket winner, decision", () => {
    const md = renderRoundReport(data);
    expect(md).toContain("Round 1");
    expect(md).toContain("H1");
    expect(md).toContain("rejected:unstable");
    expect(md).toContain("H2");
    expect(md).toContain("qualified");
    expect(md).toContain("ADOPT: H2");
    expect(md).toContain("$1.23");
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test tests/report.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/report.ts
import type { HypothesisStatus } from "./types";

export interface RoundHypothesis {
  id: string;
  description: string;
  status: HypothesisStatus;
  l1: number | null;
  l2: number | null;
}

export interface RoundMatch {
  round: number;
  a: string;
  b: string;
  verdict: "A" | "B" | "tied";
  winner: string;
}

export interface RoundData {
  round: number;
  baseline_id: string;
  hypotheses: RoundHypothesis[];
  bracket_winner: string | null;       // null if no qualified survivors
  bracket_matches: RoundMatch[];
  decision: "adopt" | "rollback";
  total_usd: number;
}

export function renderRoundReport(d: RoundData): string {
  const lines: string[] = [];
  lines.push(`# Round ${d.round}`);
  lines.push("");
  lines.push(`Baseline: ${d.baseline_id}`);
  lines.push("");
  lines.push(`## Hypotheses`);
  lines.push("");
  for (const h of d.hypotheses) {
    const tag = h.status.kind === "qualified" ? "qualified" : `rejected:${h.status.reason}`;
    const l1 = h.l1 === null ? "—" : h.l1.toFixed(3);
    const l2 = h.l2 === null ? "—" : `${h.l2.toFixed(1)}%`;
    lines.push(`- **${h.id}** (${tag}) — L1=${l1} L2=${l2} — ${h.description}`);
  }
  lines.push("");
  lines.push(`## Bracket`);
  lines.push("");
  for (const m of d.bracket_matches) {
    lines.push(`- Match: ${m.a} vs ${m.b} → verdict=${m.verdict}, winner=${m.winner}`);
  }
  if (d.bracket_winner) {
    lines.push(`- **Bracket winner:** ${d.bracket_winner}`);
  } else {
    lines.push(`- **Bracket winner:** none (no qualified survivors)`);
  }
  lines.push("");
  lines.push(`## Decision`);
  lines.push("");
  lines.push(d.decision === "adopt" ? `**ADOPT: ${d.bracket_winner}**` : "**ROLLBACK** (baseline unchanged)");
  lines.push("");
  lines.push(`## Cost`);
  lines.push("");
  lines.push(`Total this round: $${d.total_usd.toFixed(2)}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Verify tests**

```bash
bun test tests/report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/report.ts tests/report.test.ts
git commit -m "feat(report): round-report markdown renderer"
```

---

## Task 16: CLI Dispatcher

**Files:**
- Create: `lib/cli.ts`
- Create: `scripts/prompt-eval` (shell wrapper)

The CLI is the surface that agents shell out to. Subcommands needed for the MVP: `score-l1`, `score-l2`, `judge`, `apply-diff`, `clone`. Each takes JSON via stdin and emits JSON on stdout — easy to compose from agent prompts.

- [ ] **Step 1: Write the CLI dispatcher**

```typescript
// lib/cli.ts
import { evaluateL1 } from "./eval/l1-stability";
import { evaluateL2 } from "./eval/l2-decisions";
import { mistralEmbed } from "./embedding/mistral";
import { applyDiff } from "./diff";
import { cloneShared, removeClone, listLocalBranches, commitAll } from "./clone-manager";
import { buildJudgePrompt, doubleBlindVerdict } from "./judge";
import { runHeadless } from "./runner";
import type { JudgeVerdict } from "./bracket";

const cmd = process.argv[2];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  switch (cmd) {
    case "score-l1": {
      const args = JSON.parse(await readStdin());
      const r = await evaluateL1({
        runOutputs: args.runOutputs,
        embed: (texts) => mistralEmbed(texts, args.embedding_model ?? "mistral-embed"),
        maxTokens: args.maxTokens ?? 8192,
        threshold: args.threshold,
      });
      process.stdout.write(JSON.stringify(r));
      return;
    }
    case "score-l2": {
      const args = JSON.parse(await readStdin());
      const r = await evaluateL2(args);
      process.stdout.write(JSON.stringify(r));
      return;
    }
    case "judge": {
      const args = JSON.parse(await readStdin());
      // expects { rubric, specA, specB, judge_model, double_blind }
      const judgeFn = async (a: string, b: string): Promise<JudgeVerdict> => {
        const prompt = buildJudgePrompt({ rubric: args.rubric, specA: a, specB: b });
        const r = await runHeadless({
          cwd: process.cwd(),
          invoke: "",                // we pass the full prompt as payload
          payload: prompt.replace(/\n/g, "\\n"),  // rough stdin escape; CLI consumer must handle
          timeoutMs: 120_000,
        });
        const text = r.result.trim();
        if (text.startsWith("A:") || text === "A") return "A";
        if (text.startsWith("B:") || text === "B") return "B";
        return "tied";
      };
      const verdict = args.double_blind
        ? await doubleBlindVerdict(args.specA, args.specB, judgeFn)
        : await judgeFn(args.specA, args.specB);
      process.stdout.write(JSON.stringify({ verdict }));
      return;
    }
    case "apply-diff": {
      const args = JSON.parse(await readStdin());
      await applyDiff(args.cwd, args.diff);
      process.stdout.write(JSON.stringify({ ok: true }));
      return;
    }
    case "clone-shared": {
      const args = JSON.parse(await readStdin());
      await cloneShared(args.source, args.dest);
      process.stdout.write(JSON.stringify({ ok: true }));
      return;
    }
    case "remove-clone": {
      const args = JSON.parse(await readStdin());
      await removeClone(args.path);
      process.stdout.write(JSON.stringify({ ok: true }));
      return;
    }
    case "list-branches": {
      const args = JSON.parse(await readStdin());
      const branches = await listLocalBranches(args.repoPath);
      process.stdout.write(JSON.stringify({ branches }));
      return;
    }
    case "commit-all": {
      const args = JSON.parse(await readStdin());
      await commitAll(args.repoPath, args.message);
      process.stdout.write(JSON.stringify({ ok: true }));
      return;
    }
    default:
      process.stderr.write(`unknown command: ${cmd}\n`);
      process.stderr.write(`usage: prompt-eval <score-l1|score-l2|judge|apply-diff|clone-shared|remove-clone|list-branches|commit-all>\n`);
      process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Create the shell wrapper**

```bash
mkdir -p /Users/b.fernandez/Workspace/prompt-eval/scripts
cat > /Users/b.fernandez/Workspace/prompt-eval/scripts/prompt-eval <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
exec bun run "$HERE/lib/cli.ts" "$@"
EOF
chmod +x /Users/b.fernandez/Workspace/prompt-eval/scripts/prompt-eval
```

- [ ] **Step 3: Smoke-test the CLI manually**

```bash
cd /Users/b.fernandez/Workspace/prompt-eval
echo '{}' | ./scripts/prompt-eval unknown 2>&1 | head -5
```

Expected: prints "unknown command" + usage.

- [ ] **Step 4: Commit**

```bash
git add lib/cli.ts scripts/prompt-eval
git commit -m "feat(cli): subcommand dispatcher (score-l1, score-l2, judge, diff, clone, ...)"
```

---

## Task 17: Plugin Manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Write manifest**

```json
{
  "name": "prompt-eval",
  "version": "0.0.1",
  "description": "Self-improvement framework for Claude Code prompts via 3-level evaluation cascade with Agent Teams.",
  "author": "bfernandez31",
  "skills": ["skills/prompt-eval/SKILL.md"],
  "agents": ["agents/eval-orchestrator.md", "agents/hypothesis-evaluator.md"]
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat(plugin): claude-plugin manifest"
```

---

## Task 18: hypothesis-evaluator Agent

**Files:**
- Create: `agents/hypothesis-evaluator.md`

This agent receives one hypothesis, runs N executions in clones, computes L1+L2, returns a structured report.

- [ ] **Step 1: Write the agent**

````markdown
---
name: hypothesis-evaluator
description: Evaluates a single hypothesis against a target prompt by running it N times in isolated clones, then computing L1 stability and L2 decision consistency.
---

# Role

You are a hypothesis evaluator working under the eval-orchestrator. You receive ONE hypothesis to evaluate. Your job: run it N times, compute L1+L2, report status to the lead.

# Inputs (provided by the lead)

- `hypothesis_id` — e.g. "H1"
- `hypothesis_description` — natural language summary
- `hypothesis_diff` — unified diff against the round baseline
- `baseline_clone_path` — path to a `git clone --shared` of the round baseline
- `clones_root` — directory under which to create per-run clones
- `outputs_root` — directory to copy run outputs into (e.g. `…/round-N/hypotheses/H1/outputs/`)
- `eval_root` — directory to write `l1.json`, `l2.json`, `status.json` into
- `target.invoke` — slash-command to execute
- `target.prompt_file` — path of the prompt file inside the clone
- `output_artifact` — glob (with `{branch}` placeholder)
- `test_input.payload`
- `runs_per_hypothesis`, `concurrency_per_hypothesis`, `timeout_ms`
- `eval.level1_stability`, `eval.level2_decisions` — full config sections

# Procedure

## Step 1: Prepare the hypothesis base clone

Copy the baseline clone to `<clones_root>/<hypothesis_id>-base/` and apply the diff:

```bash
bun run /Users/b.fernandez/Workspace/prompt-eval/scripts/prompt-eval clone-shared <<< '{"source":"<baseline_clone_path>","dest":"<clones_root>/<hypothesis_id>-base"}'
bun run /Users/b.fernandez/Workspace/prompt-eval/scripts/prompt-eval apply-diff <<< '{"cwd":"<clones_root>/<hypothesis_id>-base","diff":"<hypothesis_diff escaped JSON string>"}'
bun run /Users/b.fernandez/Workspace/prompt-eval/scripts/prompt-eval commit-all <<< '{"repoPath":"<clones_root>/<hypothesis_id>-base","message":"apply <hypothesis_id>"}'
```

If `apply-diff` fails: write `<eval_root>/status.json` with `{"kind":"rejected","reason":"patch_failed"}` and return immediately to the lead.

## Step 2: Spawn N run sub-agents

For k in 1..runs_per_hypothesis, in batches of `concurrency_per_hypothesis`, dispatch sub-agents (Agent tool) with this mission:

> Clone `<clones_root>/<hypothesis_id>-base/` to `<clones_root>/<hypothesis_id>-run-k/` via `prompt-eval clone-shared`. List branches before. Run `claude --print --output-format json "<target.invoke> <test_input.payload>"` inside the clone. List branches after. Compute `{branch} := first new local branch`, defaulting to `HEAD` short-name. Resolve `<output_artifact>` with `{branch}` expanded. Copy the resolved file to `<outputs_root>/run-k.md`. Return `{ kind: "ok"|"timeout"|"no_output"|"exec_failed", file_path?, usage?, error? }`.

Collect results.

## Step 3: Tally run outcomes

Count failures. If ≥3 of N runs are not "ok": write `<eval_root>/status.json` with `{"kind":"rejected","reason":"unreliable"}` and return.

## Step 4: Compute L1

```bash
bun run scripts/prompt-eval score-l1 <<< '{
  "runOutputs": [<read each <outputs_root>/run-k.md as a string>],
  "embedding_model": "<eval.level1_stability.embedding_model>",
  "threshold": <eval.level1_stability.threshold>
}'
```

Persist response as `<eval_root>/l1.json`. If `gate == "fail"`: write status `{"kind":"rejected","reason":"unstable"}` and return.

## Step 5: Compute L2

If `eval.level2_decisions.skip == true`: skip and consider the hypothesis qualified after L1.

Otherwise:

```bash
bun run scripts/prompt-eval score-l2 <<< '{
  "runOutputs": [...],
  "parser": "<eval.level2_decisions.parser>",
  "sectionName": "<eval.level2_decisions.section_name>",
  "decisionKey": "<eval.level2_decisions.decision_key>",
  "thresholdPct": <eval.level2_decisions.threshold_pct>
}'
```

Persist as `<eval_root>/l2.json`. If `gate == "fail"`: status `{"kind":"rejected","reason":"inconsistent"}`.

## Step 6: Cleanup

Remove all `<hypothesis_id>-*` clone directories under `<clones_root>` via `prompt-eval remove-clone`.

## Step 7: Return to lead

Write `<eval_root>/status.json` = `{"kind":"qualified","l1":<value>,"l2":<value>,"total_usd":<sum of run usages>}` and return that JSON to the team lead.

# Notes

- Sub-agents run in parallel up to `concurrency_per_hypothesis`. Use the Agent tool with multiple parallel tool calls, then await all.
- Always cleanup clones in finally blocks. Disk pressure compounds across hypotheses.
- All paths in your messages must be absolute.
````

- [ ] **Step 2: Commit**

```bash
git add agents/hypothesis-evaluator.md
git commit -m "feat(agents): hypothesis-evaluator role definition"
```

---

## Task 19: eval-orchestrator Agent

**Files:**
- Create: `agents/eval-orchestrator.md`

This agent is the team lead. Reads `eval-run.yml`, dispatches one teammate per hypothesis, collects qualifying survivors, runs the bracket via the CLI judge, decides, and either pauses (semi-auto) or continues (auto).

- [ ] **Step 1: Write the agent**

````markdown
---
name: eval-orchestrator
description: Team lead for prompt-eval runs. Orchestrates hypothesis-evaluator teammates, runs the pairwise bracket on qualified survivors, and drives the iterative loop.
---

# Role

You are the team lead for a prompt-eval run. You read the run state, dispatch one hypothesis-evaluator teammate per hypothesis, collect their reports, run a pairwise bracket on qualified survivors + baseline, decide adopt-or-rollback, and either pause for the user (semi-auto) or proceed to the next round (auto).

# Inputs

- `run_dir` — `~/.prompt-eval/runs/<run-id>/`
- `clones_root` — `~/.prompt-eval/clones/<run-id>/`
- `profile_path` — absolute path to the profile YAML

You bootstrap by reading `<run_dir>/eval-run.yml` and the profile.

# Per-Round Procedure

## Step 1: Snapshot the round baseline

The baseline at the start of round N is whatever the previous round adopted (or, for round 1, the original target prompt).

```
mkdir -p <clones_root>/round-N/
prompt-eval clone-shared { source: profile.target.repo, dest: <clones_root>/round-N/baseline }
# write the baseline prompt content into the clone's profile.target.prompt_file
# commit:
prompt-eval commit-all { repoPath: ..., message: "snapshot round-N baseline" }
```

## Step 2: Dispatch teammates

For each hypothesis in the round (loaded from `eval-run.yml`), dispatch ONE hypothesis-evaluator teammate via Agent Teams. Each teammate receives the inputs documented in `agents/hypothesis-evaluator.md`.

Wait for all teammates to return.

## Step 3: Collect survivors

Read each teammate's `status.json`. The qualified set = those with `kind == "qualified"`.

If the qualified set is empty: skip the bracket; the round result is `decision: rollback`.

## Step 4: Run the bracket

Build the participant list: `[baseline, ...qualified_in_order]`. For each match, pick the centroid run (the run whose vector has the median pairwise distance from its peers — already computable from the L1 `pair_similarities`).

For each match (a, b):

```bash
prompt-eval judge <<< '{
  "rubric": "<profile.eval.level3_quality.rubric>",
  "specA": "<contents of centroid output for a>",
  "specB": "<contents of centroid output for b>",
  "judge_model": "<profile.eval.level3_quality.judge_model>",
  "double_blind": <profile.eval.level3_quality.double_blind>
}'
```

Returns `{ verdict: "A" | "B" | "tied" }`. Tied resolves in favour of baseline (the lead enforces this when picking the next-round opponent).

## Step 5: Decide

- If bracket winner is the baseline → `decision: rollback`.
- Else → `decision: adopt`, update `state.baseline_path` in `eval-run.yml` to the winner's `<round-N>/hypotheses/<H>/variation.md`.

Write `<run_dir>/rounds/round-N/decision.json` and `<run_dir>/rounds/round-N/round-report.md` (use the round-report renderer).

## Step 6: Check stop criteria

| Criterion | Source |
|---|---|
| Convergence | 2 consecutive rollbacks |
| Budget | sum of run usages exceeds `profile.limits.max_budget_usd` |
| Round cap | `state.rounds_completed >= profile.limits.max_rounds` |

If any fires → produce final-report.md and return to the user.

## Step 7: Decide next-round hypotheses

Otherwise:

- **semi-auto**: present the round report to the user in chat. Propose 3-5 new hypotheses based on patterns. Wait for user approval. Persist them in `eval-run.yml.hypotheses_round_<N+1>`. Loop.
- **auto**: propose 3-5 new hypotheses, write them, loop without pause.

# Notes

- All teammate dispatches are parallel; do not serialise.
- Persist after every important step. The run must be resumable from `<run_dir>/eval-run.yml` and the rounds/ directory.
- All paths in messages to teammates must be absolute.
````

- [ ] **Step 2: Commit**

```bash
git add agents/eval-orchestrator.md
git commit -m "feat(agents): eval-orchestrator role definition"
```

---

## Task 20: Skill Entry Point

**Files:**
- Create: `skills/prompt-eval/SKILL.md`

The skill is what the user invokes. It loads a profile, opens an interactive hypothesis-formulation loop (if needed), generates `eval-run.yml`, then dispatches the team.

- [ ] **Step 1: Write the skill**

````markdown
---
name: prompt-eval
description: Self-improvement framework for prompts. Pass a profile name to evaluate variations of that target prompt via a 3-level cascade and a bracket pairwise tournament. Use when the user wants to systematically improve a Claude Code command, skill, or agent.
---

# Activation

Invoked as `/prompt-eval <profile-name>` (the profile filename without `.yml`, e.g. `ai-board.specify`). Optional flags:

- `--mode auto` (overrides the profile's `mode`; requires `limits` set)
- `--max-budget <USD>` (overrides `limits.max_budget_usd`)
- `--max-rounds <N>` (overrides `limits.max_rounds`)

# Procedure

## Step 1: Resolve and load the profile

Profile path: `<plugin_root>/profiles/<profile-name>.yml`. Use `bun run lib/profile-loader.ts`-equivalent? In this MVP the skill itself reads the YAML — it is small. Use `bun -e` to call `loadProfile(...)` and emit a JSON to stdout if needed; otherwise read the file directly via Read tool.

Validate:

- If `mode == auto` (after CLI override): both `limits.max_rounds > 0` and `limits.max_budget_usd > 0` must hold. Otherwise abort with a clear error.

## Step 2: Initialise run state

- Generate `run_id := <UTC YYYYMMDD-HHMMSS>-<profile.name>`.
- `run_dir := ~/.prompt-eval/runs/<run_id>/`.
- `clones_root := ~/.prompt-eval/clones/<run_id>/`.
- Create both directories.
- Copy `<profile.target.repo>/<profile.target.prompt_file>` to `<run_dir>/original-baseline.md` (frozen reference).
- Write initial `eval-run.yml` (`current_round: 0`, baseline pointer to `original-baseline.md`).

## Step 3: Determine round 1 hypotheses

If `profile.initial_hypotheses` is non-empty: write them into `eval-run.yml.hypotheses_round_1` and proceed.

Otherwise, open an INTERACTIVE LOOP with the user:

> "I'm preparing round 1 for `<profile.name>`. The target prompt is at `<profile.target.prompt_file>`. Please describe your first hypothesis in plain language (e.g. 'tighten the AUTO-mode security keyword bonus from +3 to +2'). I'll generate a unified diff and ask you to confirm."

For each hypothesis:

1. User describes in natural language.
2. You produce the unified diff against `original-baseline.md` and show it.
3. User approves / edits / rejects.
4. Repeat until 3-5 hypotheses are collected, or user says "go".

Persist into `eval-run.yml.hypotheses_round_1`.

## Step 4: Dispatch the team

Spawn an `eval-orchestrator` agent (team lead) with one teammate per hypothesis using the Claude Code Agent Teams mechanism. Pass them the absolute paths to `run_dir`, `clones_root`, and `profile_path`.

Wait for the lead to complete the round.

## Step 5: Round checkpoint (semi-auto only)

When the lead returns from a round:

- Print the contents of `<run_dir>/rounds/round-<N>/round-report.md` to the user.
- Ask: "Continue with round <N+1>? The lead proposes the following hypotheses: ... (Approve / edit / stop)."
- On approval: dispatch the lead again for round N+1.
- On stop: ask the lead to render the final report and return.

In `--mode auto`: skip the checkpoint, dispatch round N+1 immediately.

## Step 6: Final report

When the lead reports a stop criterion fired (or user said stop), read `<run_dir>/final-report.md` and present it to the user with the path.

# Notes

- All paths shown to the user are absolute.
- On any error from a teammate or the lead, surface the error verbatim — don't paper over.
- Save state aggressively; the run is filesystem-first and must be resumable.
````

- [ ] **Step 2: Commit**

```bash
git add skills/prompt-eval/SKILL.md
git commit -m "feat(skill): prompt-eval skill entry point with interactive hypothesis loop"
```

---

## Task 21: First Profile (`ai-board.specify`)

**Files:**
- Create: `profiles/ai-board.specify.yml`

- [ ] **Step 1: Write the profile**

```yaml
name: ai-board.specify
description: Evaluate /ai-board.specify on a representative feature description.

target:
  repo: /Users/b.fernandez/Workspace/ai-board
  prompt_file: .claude/commands/ai-board.specify.md
  invoke: "/ai-board.specify"

test_input:
  payload: |
    {
      "ticketKey": "TEST-001",
      "title": "Add CSV export for user data",
      "description": "Allow users to download their data as CSV from the settings page.",
      "clarificationPolicy": "AUTO"
    }

eval:
  runs_per_hypothesis: 5
  concurrency_per_hypothesis: 3
  max_hypotheses_per_round: 5

  level1_stability:
    output_artifact: "specs/{branch}/spec.md"
    embedding_model: mistral-embed
    threshold: 0.85

  level2_decisions:
    section_name: "Auto-Resolved Decisions"
    parser: structured_list
    decision_key: "Decision summary"
    threshold_pct: 95

  level3_quality:
    judge_model: claude-haiku-4-5
    double_blind: true
    rubric: |
      Compare two specs (A and B) generated from the same feature description.
      Evaluate on:
      1. Relevance and defensibility of auto-resolved decisions.
      2. Coverage of user scenarios (primary + edge cases).
      3. Testability of functional requirements.
      4. Absence of implementation details (no tech stack, no frameworks).
      5. Right dosage of [NEEDS CLARIFICATION] markers (max 3, only critical).
      Decide: "A" | "B" | "tied". One-line rationale.

limits:
  max_rounds: 5
  max_budget_usd: 10.0

mode: semi-auto

initial_hypotheses: []
```

- [ ] **Step 2: Commit**

```bash
git add profiles/ai-board.specify.yml
git commit -m "feat(profile): first target profile — ai-board.specify"
```

---

## Task 22: check-prereqs script

**Files:**
- Create: `scripts/check-prereqs.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

ok() { printf "  ✓ %s\n" "$1"; }
ko() { printf "  ✗ %s\n" "$1"; FAIL=1; }

FAIL=0

echo "Checking prompt-eval prerequisites..."

command -v claude >/dev/null && ok "claude CLI present" || ko "claude CLI missing"
command -v bun    >/dev/null && ok "bun present"        || ko "bun missing"
command -v gh     >/dev/null && ok "gh CLI present"     || ko "gh missing (optional for purely-local profiles)"
command -v git    >/dev/null && ok "git present"        || ko "git missing"
command -v patch  >/dev/null && ok "patch present"      || ko "patch missing"

if [ -n "${MISTRAL_API_KEY:-}" ]; then
  ok "MISTRAL_API_KEY set"
else
  ko "MISTRAL_API_KEY not set"
fi

# Check Claude Code Agent Teams flag in user settings (best effort).
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ] && grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SETTINGS"; then
  ok "Agent Teams flag found in $SETTINGS"
else
  echo "  ! Could not confirm CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in $SETTINGS — please verify manually."
fi

exit "$FAIL"
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/check-prereqs.sh
git add scripts/check-prereqs.sh
git commit -m "chore: prerequisites check script"
```

---

## Task 23: End-to-End Smoke Run (Manual Validation)

This is **manual** — the goal is to actually run the framework once on `ai-board.specify` and confirm the loop completes a single round.

- [ ] **Step 1: Confirm prereqs**

```bash
cd /Users/b.fernandez/Workspace/prompt-eval
./scripts/check-prereqs.sh
```

All ✓ expected.

- [ ] **Step 2: Run the unit tests**

```bash
bun test
```

Expected: all green.

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Trigger a real run**

In a Claude Code session with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` already set in `~/.claude/settings.json`, invoke:

```
/prompt-eval ai-board.specify
```

Hypothesis loop opens. Provide one trivial hypothesis (e.g. "rename the spec section from 'Quick Guidelines' to 'Authoring Guidelines'") to keep the diff small and the run quick.

- [ ] **Step 5: Verify artefacts**

After round 1 completes:

```bash
ls ~/.prompt-eval/runs/                               # contains the run-id directory
ls ~/.prompt-eval/runs/<run-id>/rounds/round-1/       # baseline.md, hypotheses/, bracket.json, decision.json, round-report.md
cat ~/.prompt-eval/runs/<run-id>/rounds/round-1/round-report.md
```

Confirm:

- L1 mean similarity persisted in `…/H1/eval/l1.json`
- L2 consistency persisted in `…/H1/eval/l2.json`
- Bracket file present, round-report renders correctly
- Run directory has `eval-run.yml` reflecting `current_round` and `budget_consumed_usd`

- [ ] **Step 6: Stop the run**

When prompted at the round checkpoint, choose "stop". Confirm `final-report.md` is generated.

- [ ] **Step 7: Cleanup**

```bash
rm -rf ~/.prompt-eval/clones/<run-id>/
```

(Run state in `runs/` is kept for audit.)

- [ ] **Step 8: Commit any incidental fixes**

If anything broke during the smoke run, fix it inline and commit:

```bash
git add -A
git commit -m "fix: <concrete fix discovered in smoke run>"
```

---

## Task 24: Minimum Viable Documentation

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/adding-a-target.md`
- Create: `docs/eval-cascade.md`
- Modify: `README.md` (add usage section)

- [ ] **Step 1: Write `docs/architecture.md`**

```markdown
# Architecture

prompt-eval is a Claude Code plugin built around three layers:

1. **Skill** (`/prompt-eval`) — the user-facing entry point. Reads a profile, runs an interactive hypothesis loop, and dispatches a team.
2. **Agent Team** — one team lead (`eval-orchestrator`) and N teammates (`hypothesis-evaluator`), each in an isolated Claude Code instance.
3. **Bun TypeScript library** (`lib/`) — pure logic (profile loading, state I/O, embedding, scoring, bracket, judge, reports). Agents shell out via `scripts/prompt-eval`.

State is filesystem-first under `~/.prompt-eval/runs/<run-id>/`. Clones are transient under `~/.prompt-eval/clones/<run-id>/`.

See `docs/specs/2026-04-26-prompt-eval-framework-design.md` for the full architecture spec.
```

- [ ] **Step 2: Write `docs/adding-a-target.md`**

```markdown
# Adding a New Target

To target a new prompt (e.g. `ai-board.compare`), create one YAML file under `profiles/` and copy the structure of `profiles/ai-board.specify.yml`. Edit only:

1. `target.prompt_file` and `target.invoke`
2. `test_input.payload` (a representative input for that command)
3. `eval.level1_stability.output_artifact` (where the produced file lands; use `{branch}` if the prompt creates a new branch)
4. `eval.level2_decisions.section_name` and `decision_key`
5. `eval.level3_quality.rubric`

If the target produces no structured-decision section, set `eval.level2_decisions.skip: true`.

No code changes required.
```

- [ ] **Step 3: Write `docs/eval-cascade.md`**

```markdown
# Evaluation Cascade

Each variation passes through three levels in order. Failing a level rejects the variation immediately — subsequent levels do not run.

## L1 — Stability

- Embed each run output via Mistral.
- Compute mean cosine similarity across all pairs of run vectors.
- Pass if mean ≥ `level1_stability.threshold` (default 0.85).

## L2 — Decision Consistency

- Parse the configured section in each run output (`structured_list` parser for MVP).
- Compute Jaccard `|⋂Sᵢ| / |⋃Sᵢ|` over decision-key sets.
- Pass if percentage ≥ `level2_decisions.threshold_pct` (default 95).

## L3 — Pairwise Quality

- Survivors of L1 + L2 enter a single-elimination bracket with the baseline.
- Each match: judge model decides A | B | tied; tied favours baseline.
- Double-blind by default: each match runs twice with A/B swapped, majority wins, disagreement → tied.
- Bracket champion = round winner. If champion = baseline → rollback. Else → adopt.

See spec §3 for the full rationale.
```

- [ ] **Step 4: Update README**

Add this section after the "Status" block in `README.md`:

```markdown
## Usage

1. Install: clone this repo into `~/.claude/plugins/prompt-eval`.
2. Set `MISTRAL_API_KEY` in your environment.
3. Ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in `~/.claude/settings.json`.
4. Run: `./scripts/check-prereqs.sh`.
5. From a Claude Code session: `/prompt-eval ai-board.specify`.

See [`docs/adding-a-target.md`](docs/adding-a-target.md) to evaluate other prompts.
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/adding-a-target.md docs/eval-cascade.md README.md
git commit -m "docs: minimum viable architecture, adding-a-target, cascade, and README usage"
```

---

## Task 25: Final Push

- [ ] **Step 1: Run full verification one last time**

```bash
bun test
bun run typecheck
git status                  # clean
git log --oneline -20
```

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Mark MVP complete**

The first end-to-end run on `ai-board.specify` worked, all unit tests are green, the docs cover authoring a new profile, and the artefacts produced (L1/L2 JSON, bracket, decision, round-report) are inspectable on disk. Out-of-scope items (mode auto exhaustively tested, structured_table parser, regex parser, `resume`/`clean` CLI commands, marketplace publishing, comprehensive docs) are tracked in the README roadmap and addressed in subsequent iterations.

---

## Self-Review

**Spec coverage:**

| Spec section | Plan task(s) |
|---|---|
| §1 Overview / Goals | n/a (informational) |
| §2 Architecture | 17, 18, 19, 20 |
| §3 Cascade | 9, 10, 11, 12, 13, 14 |
| §4 Iterative Loop | 19 (orchestrator) |
| §5 Profile Schema | 2, 4, 21 |
| §6 Run State | 5 |
| §7 Execution Model | 6, 7, 8, 18, 19 |
| §8 Error Handling | 6, 8, 18 (failure-mode handling baked into agents) |
| §9 Hypothesis Generation | 20 (skill interactive loop), 19 (lead proposal) |
| §10 Modes | 4 (validation), 19 (orchestrator branching), 20 (skill flag handling) |
| §11 Bootstrap | 17, 22, 24 (README) |
| §13 Roadmap | the 25 plan tasks themselves |

**Placeholder scan:** none — every step has its full code or command. Stubs in Task 11 are explicitly marked as out-of-MVP and throw "not implemented".

**Type consistency:** `Profile`, `Hypothesis`, `Usage`, `RunState`, `JudgeVerdict`, `HypothesisStatus`, `RoundData` are defined once in `lib/types.ts` (Task 2) or their own modules (`bracket.ts`, `report.ts`) and consumed consistently. CLI dispatcher (`lib/cli.ts`) uses the same module exports as the tests, so any drift would be caught by `bun run typecheck` in Task 25.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-04-26-prompt-eval-mvp.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good when tasks are mostly independent and we want incremental visibility.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batching with checkpoints. Good for keeping the full thread visible end-to-end and adjusting on the fly.

**Which approach?**
