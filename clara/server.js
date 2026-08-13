#!/usr/bin/env node
/**
 * ブラウザで使う画面。`node server.js` で起動して、自動でブラウザが開く。
 * 外部からは接続できないよう 127.0.0.1 のみで待ち受ける。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { loadEnv, saveApiKey, saveEnvValues, PROJECT_ROOT } from "./src/config.js";
import { generatePlan } from "./src/planner.js";
import { createRunDir, writePlanFiles } from "./src/output.js";
import { describeError } from "./src/errors.js";
import { publishImagePost, verifyAccount } from "./src/instagram.js";

const PORT = Number(process.env.PORT) || 5178;
const INDEX_PATH = path.join(PROJECT_ROOT, "public", "index.html");

loadEnv();

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("入力が長すぎます。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("リクエストの形式が不正です。"));
      }
    });
    req.on("error", reject);
  });
}

async function handlePlan(req, res) {
  const body = await readBody(req);
  const brief = String(body.brief ?? "").trim();

  if (!brief) {
    sendJson(res, 400, { error: "ビジネスの説明文を入力してください。" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(res, 400, { error: "APIキーが設定されていません。最初の画面でキーを登録してください。" });
    return;
  }

  const result = await generatePlan({
    brief,
    count: 3,
    tone: String(body.tone ?? "").trim(),
    extraNotes: String(body.notes ?? "").trim(),
  });

  const runDir = createRunDir(path.join(PROJECT_ROOT, "output"));
  const { jsonPath, mdPath } = writePlanFiles(runDir, result);

  sendJson(res, 200, {
    plan: result.plan,
    usage: result.meta.usage,
    savedTo: { dir: runDir, jsonPath, mdPath },
  });
}

async function handleKey(req, res) {
  const body = await readBody(req);
  const key = String(body.key ?? "").trim();

  if (!key.startsWith("sk-ant-")) {
    sendJson(res, 400, { error: "APIキーは sk-ant- で始まる文字列です。コピー漏れがないか確認してください。" });
    return;
  }

  saveApiKey(key);
  sendJson(res, 200, { ok: true });
}

async function handleInstagramStatus(req, res) {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;

  if (!userId || !token) {
    sendJson(res, 200, { configured: false });
    return;
  }

  try {
    const account = await verifyAccount({ userId, token });
    sendJson(res, 200, { configured: true, username: account.username });
  } catch (error) {
    // 設定はあるが使えない状態（期限切れなど）。画面で登録し直せるようにする。
    sendJson(res, 200, { configured: false, savedButInvalid: true, error: error.message });
  }
}

async function handleInstagramSettings(req, res) {
  const body = await readBody(req);
  const userId = String(body.userId ?? "").trim();
  const token = String(body.token ?? "").trim();

  if (!/^\d+$/.test(userId)) {
    sendJson(res, 400, { error: "InstagramのユーザーIDは数字だけの文字列です。確認してください。" });
    return;
  }
  if (!token) {
    sendJson(res, 400, { error: "アクセストークンを入力してください。" });
    return;
  }

  // 保存する前に、実際に使えるトークンかを確かめる。
  const account = await verifyAccount({ userId, token });
  saveEnvValues({ IG_USER_ID: userId, IG_ACCESS_TOKEN: token });

  sendJson(res, 200, { ok: true, username: account.username });
}

async function handlePublish(req, res) {
  const body = await readBody(req);
  const imageUrl = String(body.imageUrl ?? "").trim();
  const caption = String(body.caption ?? "").trim();

  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;

  if (!userId || !token) {
    sendJson(res, 400, { error: "Instagramの連携が未設定です。画面上部から登録してください。" });
    return;
  }
  if (!/^https:\/\//i.test(imageUrl)) {
    sendJson(res, 400, {
      error: "画像のURLは https:// で始まる、誰でも開けるものを指定してください。",
    });
    return;
  }
  if (!caption) {
    sendJson(res, 400, { error: "投稿本文が空です。" });
    return;
  }

  const result = await publishImagePost({ userId, token, imageUrl, caption });
  sendJson(res, 200, result);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
      const html = fs.readFileSync(INDEX_PATH);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && req.url === "/api/status") {
      sendJson(res, 200, { hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
      return;
    }
    if (req.method === "POST" && req.url === "/api/key") {
      await handleKey(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/plan") {
      await handlePlan(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/instagram/status") {
      await handleInstagramStatus(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/instagram/settings") {
      await handleInstagramSettings(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/publish") {
      await handlePublish(req, res);
      return;
    }
    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: describeError(error) });
  }
});

function openBrowser(url) {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* 開けなくても手動でURLを叩けばよいので無視 */
  }
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `\nポート ${PORT} はすでに使われています。\n` +
        `Claraが二重に起動している可能性があります。ブラウザで http://localhost:${PORT} を開いてみてください。\n`,
    );
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Clara が起動しました → ${url}`);
  console.log("  ブラウザが自動で開きます。開かない場合は上のURLをコピーしてください。");
  console.log("  終了するには、この黒い画面で Ctrl + C を押すか、ウィンドウを閉じてください。\n");
  if (process.env.CLARA_NO_OPEN !== "1") openBrowser(url);
});
