// @bun
// lib/embedding/chunking.ts
var CHARS_PER_TOKEN = 4;
function approximateTokens(s) {
  return Math.floor(s.length / CHARS_PER_TOKEN);
}
function chunkBySection(markdown, maxTokens) {
  if (approximateTokens(markdown) <= maxTokens) {
    return [{ text: markdown, weight: markdown.length }];
  }
  const sections = [];
  const lines = markdown.split(`
`);
  let buf = [];
  for (const line of lines) {
    if (line.startsWith("## ") && buf.length > 0) {
      sections.push(buf.join(`
`));
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length > 0)
    sections.push(buf.join(`
`));
  const chunks = [];
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

// lib/embedding/similarity.ts
function cosine(a, b) {
  if (a.length !== b.length)
    throw new Error("cosine: dimension mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0;i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0)
    return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function meanPairwise(vectors) {
  if (vectors.length < 2)
    throw new Error("meanPairwise: need \u22652 vectors");
  let sum = 0;
  let count = 0;
  for (let i = 0;i < vectors.length; i++) {
    for (let j = i + 1;j < vectors.length; j++) {
      sum += cosine(vectors[i], vectors[j]);
      count += 1;
    }
  }
  return sum / count;
}

// lib/eval/l1-stability.ts
async function evaluateL1(args) {
  if (args.runOutputs.length < 2) {
    throw new Error("L1 needs at least 2 run outputs");
  }
  const perRunVectors = [];
  for (const out of args.runOutputs) {
    const chunks = chunkBySection(out, args.maxTokens);
    const { embeddings } = await args.embed(chunks.map((c) => c.text));
    const totalWeight = chunks.reduce((s, c) => s + c.weight, 0);
    const dim = embeddings[0].length;
    const agg = new Array(dim).fill(0);
    for (let i = 0;i < embeddings.length; i++) {
      const w = chunks[i].weight / totalWeight;
      const e = embeddings[i];
      for (let d = 0;d < dim; d++)
        agg[d] += e[d] * w;
    }
    perRunVectors.push(agg);
  }
  const pair_similarities = [];
  for (let i = 0;i < perRunVectors.length; i++) {
    for (let j = i + 1;j < perRunVectors.length; j++) {
      pair_similarities.push({ i, j, sim: cosine(perRunVectors[i], perRunVectors[j]) });
    }
  }
  const mean_similarity = meanPairwise(perRunVectors);
  return {
    pair_similarities,
    mean_similarity,
    gate: mean_similarity >= args.threshold ? "pass" : "fail"
  };
}

// lib/eval/parsers/structured-list.ts
function parseStructuredList(markdown, sectionName, decisionKey) {
  const lines = markdown.split(`
`);
  const sectionStart = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, "").trim() === sectionName);
  if (sectionStart === -1)
    return [];
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1;i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  const items = [];
  const re = new RegExp(`^-\\s+\\*\\*${escapeRe(decisionKey)}\\*\\*\\s*:\\s*(.+?)\\s*$`);
  for (let i = sectionStart + 1;i < sectionEnd; i++) {
    const m = re.exec(lines[i]);
    if (m)
      items.push(m[1]);
  }
  return items;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// lib/eval/parsers/structured-table.ts
function parseStructuredTable() {
  throw new Error("parser 'structured_table' not implemented in MVP");
}

// lib/eval/parsers/regex.ts
function parseRegex() {
  throw new Error("parser 'regex' not implemented in MVP");
}

// lib/eval/l2-decisions.ts
async function evaluateL2(args) {
  const parse = (md) => {
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
  const union = new Set;
  for (const s of sets)
    for (const v of s)
      union.add(v);
  const intersection = new Set(sets[0]);
  for (let i = 1;i < sets.length; i++) {
    for (const v of [...intersection])
      if (!sets[i].has(v))
        intersection.delete(v);
  }
  const consistency_pct = union.size === 0 ? 0 : intersection.size / union.size * 100;
  const gate = consistency_pct >= args.thresholdPct ? "pass" : "fail";
  return { per_run_decisions, flaky_count, consistency_pct, gate };
}

// lib/embedding/mistral.ts
async function mistralEmbed(input, model = "mistral-embed") {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey)
    throw new Error("MISTRAL_API_KEY not set");
  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input })
  });
  if (!res.ok) {
    throw new Error(`mistral embed failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return { embeddings: json.data.map((d) => d.embedding) };
}

// lib/diff.ts
import { spawn } from "child_process";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
async function applyDiff(cwd, unifiedDiff) {
  const tmp = await mkdtemp(join(tmpdir(), "pe-patch-"));
  const patchFile = join(tmp, "h.diff");
  await writeFile(patchFile, unifiedDiff);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("patch", ["-p1", "-i", patchFile, "--no-backup-if-mismatch"], { cwd });
      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("exit", (code) => {
        if (code === 0)
          resolve();
        else
          reject(new Error(`patch exited ${code}: ${stderr}`));
      });
    });
  } finally {
    await rm(tmp, { recursive: true });
  }
}

// lib/clone-manager.ts
import { spawn as spawn2 } from "child_process";
import { rm as rm2 } from "fs/promises";
async function cloneShared(source, dest) {
  await runGit(["clone", "--shared", "--quiet", source, dest]);
}
async function removeClone(path) {
  await rm2(path, { recursive: true, force: true });
}
async function listLocalBranches(repoPath) {
  const stdout = await runGitStdout(["-C", repoPath, "branch", "--format=%(refname:short)"]);
  return stdout.split(`
`).map((s) => s.trim()).filter(Boolean);
}
async function commitAll(repoPath, message) {
  await runGit(["-C", repoPath, "add", "-A"]);
  await runGit([
    "-C",
    repoPath,
    "-c",
    "user.email=eval@local",
    "-c",
    "user.name=prompt-eval",
    "commit",
    "-q",
    "-m",
    message
  ]);
}
function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn2("git", args);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("exit", (code) => {
      if (code === 0)
        resolve();
      else
        reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}
function runGitStdout(args) {
  return new Promise((resolve, reject) => {
    const child = spawn2("git", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("exit", (code) => {
      if (code === 0)
        resolve(stdout);
      else
        reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr}`));
    });
  });
}

// lib/judge.ts
function buildJudgePrompt(args) {
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
async function doubleBlindVerdict(specA, specB, judge) {
  const v1 = await judge(specA, specB);
  const v2 = await judge(specB, specA);
  const v2Mapped = v2 === "A" ? "B" : v2 === "B" ? "A" : "tied";
  if (v1 === v2Mapped)
    return v1;
  return "tied";
}

// lib/runner.ts
import { spawn as spawn3 } from "child_process";
async function runHeadless(args) {
  const claude = args.claudePath ?? "claude";
  const argv = [
    "--print",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    `${args.invoke} ${args.payload}`
  ];
  const child = spawn3(claude, argv, { cwd: args.cwd });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => {
    stdout += d.toString();
  });
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
    }, args.timeoutMs);
  });
  const completion = new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (timer)
        clearTimeout(timer);
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
            cost_usd: Number(parsed.usage?.cost_usd ?? 0)
          },
          raw: stdout
        });
      } catch (e) {
        reject(new Error(`failed to parse claude JSON output: ${e.message}
STDOUT:
${stdout}`));
      }
    });
  });
  return await Promise.race([completion, timeout]);
}

// lib/cli.ts
var cmd = process.argv[2];
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function main() {
  switch (cmd) {
    case "score-l1": {
      const args = JSON.parse(await readStdin());
      const r = await evaluateL1({
        runOutputs: args.runOutputs,
        embed: (texts) => mistralEmbed(texts, args.embedding_model ?? "mistral-embed"),
        maxTokens: args.maxTokens ?? 8192,
        threshold: args.threshold
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
      const judgeFn = async (a, b) => {
        const prompt = buildJudgePrompt({ rubric: args.rubric, specA: a, specB: b });
        const r = await runHeadless({
          cwd: process.cwd(),
          invoke: "",
          payload: prompt,
          timeoutMs: 120000
        });
        const text = r.result.trim();
        if (text.startsWith("A:") || text === "A")
          return "A";
        if (text.startsWith("B:") || text === "B")
          return "B";
        return "tied";
      };
      const verdict = args.double_blind ? await doubleBlindVerdict(args.specA, args.specB, judgeFn) : await judgeFn(args.specA, args.specB);
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
      process.stderr.write(`unknown command: ${cmd}
`);
      process.stderr.write(`usage: prompt-eval <score-l1|score-l2|judge|apply-diff|clone-shared|remove-clone|list-branches|commit-all>
`);
      process.exit(2);
  }
}
main().catch((e) => {
  process.stderr.write(`error: ${e.message}
`);
  process.exit(1);
});
