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
      const judgeFn = async (a: string, b: string): Promise<JudgeVerdict> => {
        const prompt = buildJudgePrompt({ rubric: args.rubric, specA: a, specB: b });
        const r = await runHeadless({
          cwd: process.cwd(),
          invoke: "",
          payload: prompt,
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
      process.stderr.write(
        `usage: prompt-eval <score-l1|score-l2|judge|apply-diff|clone-shared|remove-clone|list-branches|commit-all>\n`,
      );
      process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});
