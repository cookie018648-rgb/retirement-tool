#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { loadEnv, PROJECT_ROOT, DEFAULT_EFFORT, DEFAULT_MODEL } from "./src/config.js";
import { buildUserPrompt, generatePlan } from "./src/planner.js";
import { createRunDir, writePlanFiles } from "./src/output.js";
import { describeError } from "./src/errors.js";

const USAGE = `Clara MVP — ステップ①: 企画・キャプション生成（コマンド版）

ふだんは start.bat（Mac/Linux は node server.js）でブラウザから使ってください。
このコマンド版は、自動実行やバッチ処理に組み込むとき用です。

使い方:
  node clara.js plan --brief "東京のシングルオリジン豆専門の自家焙煎ロースタリー"
  node clara.js plan --brief-file ./brief.txt --count 3 --tone "落ち着いた大人向け"

オプション:
  --brief <text>       ビジネス説明文（--brief-file と併用不可）
  --brief-file <path>  ビジネス説明文を書いたテキストファイル
  --count <n>          投稿案の件数（既定: 3、最大: 3）
  --tone <text>        トーン指定（任意）
  --notes <text>       補足情報（住所・営業時間・キャンペーンなど。任意）
  --slug <text>        出力フォルダ名につける英数字の識別子（任意）
  --model <id>         使用モデル（既定: ${DEFAULT_MODEL}）
  --effort <level>     low|medium|high|xhigh|max（既定: ${DEFAULT_EFFORT}）
  --out <dir>          出力先の親ディレクトリ（既定: ./output）
  --dry-run            APIを呼ばず、送信するプロンプトだけ表示する
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === "dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`--${key} に値が指定されていません。`);
    args[key] = value;
  }
  return args;
}

function resolveBrief(args) {
  if (args.brief && args["brief-file"]) {
    throw new Error("--brief と --brief-file は同時に指定できません。");
  }
  if (args["brief-file"]) {
    const file = path.resolve(args["brief-file"]);
    if (!fs.existsSync(file)) throw new Error(`ファイルが見つかりません: ${file}`);
    return fs.readFileSync(file, "utf8").trim();
  }
  if (args.brief) return args.brief.trim();
  throw new Error("--brief か --brief-file でビジネス説明文を指定してください。");
}

async function runPlan(args) {
  const brief = resolveBrief(args);
  const count = Math.min(Number(args.count ?? 3) || 3, 3);
  const tone = args.tone ?? "";
  const extraNotes = args.notes ?? "";

  if (args.dryRun) {
    console.log("--- 送信するユーザープロンプト（dry-run） ---\n");
    console.log(buildUserPrompt({ brief, count, tone, extraNotes }));
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.example をコピーして .env を作成してください。",
    );
  }

  console.log(`企画を生成中… (件数: ${count})`);
  const result = await generatePlan({
    brief,
    count,
    tone,
    extraNotes,
    ...(args.model ? { model: args.model } : {}),
    ...(args.effort ? { effort: args.effort } : {}),
  });

  const baseDir = path.resolve(args.out ?? path.join(PROJECT_ROOT, "output"));
  const runDir = createRunDir(baseDir, args.slug ?? "");
  const { jsonPath, mdPath } = writePlanFiles(runDir, result);

  console.log(`\n生成完了: ${result.plan.posts.length}件`);
  for (const post of result.plan.posts) {
    console.log(`  [${post.id}] ${post.angle} — ${post.hook}`);
  }
  console.log(
    `\nトークン: in ${result.meta.usage.inputTokens} / out ${result.meta.usage.outputTokens}`,
  );
  console.log(`保存先:\n  ${jsonPath}\n  ${mdPath}`);
}

async function main() {
  loadEnv();

  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  const args = parseArgs(argv.slice(1));

  switch (command) {
    case "plan":
      await runPlan(args);
      break;
    default:
      console.error(`未知のコマンド: ${command}\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`エラー: ${describeError(error)}`);
  process.exitCode = 1;
});
