import fs from "node:fs";
import path from "node:path";

function timestampDir(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    p(date.getMonth() + 1),
    p(date.getDate()),
    "-",
    p(date.getHours()),
    p(date.getMinutes()),
    p(date.getSeconds()),
  ].join("");
}

/** 出力先ディレクトリを作って絶対パスを返す。 */
export function createRunDir(baseDir, slug = "") {
  const safeSlug = slug.replace(/[^\w\-]/g, "").slice(0, 24);
  const dir = path.join(baseDir, safeSlug ? `${timestampDir()}-${safeSlug}` : timestampDir());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writePlanFiles(dir, { plan, meta }) {
  const jsonPath = path.join(dir, "plan.json");
  const mdPath = path.join(dir, "plan.md");

  fs.writeFileSync(jsonPath, JSON.stringify({ meta, plan }, null, 2) + "\n", "utf8");
  fs.writeFileSync(mdPath, renderMarkdown({ plan, meta }), "utf8");

  return { jsonPath, mdPath };
}

export function renderMarkdown({ plan, meta }) {
  const { businessProfile: bp, posts } = plan;
  const out = [];

  out.push("# Clara MVP — 投稿企画", "");
  out.push(`- 生成日時: ${meta.generatedAt}`);
  out.push(`- モデル: ${meta.model} (effort: ${meta.effort})`);
  out.push(
    `- トークン: in ${meta.usage.inputTokens} / out ${meta.usage.outputTokens}`,
    "",
  );

  out.push("## ビジネスプロフィール", "");
  out.push(`- 要約: ${bp.summary}`);
  out.push(`- カテゴリ: ${bp.category}`);
  out.push(`- ターゲット: ${bp.targetAudience}`);
  out.push(`- トーン: ${bp.brandTone}`);
  out.push(`- キーワード: ${bp.keywords.join(" / ")}`, "");

  for (const post of posts) {
    out.push(`## ${post.id} ｜ ${post.angle}`, "");
    out.push(`**コンセプト**: ${post.concept}`, "");
    out.push(`**フック**: ${post.hook}`, "");
    out.push("**キャプション**", "", "```", post.caption, "```", "");
    out.push("**ハッシュタグ**", "", "```", post.hashtags.join(" "), "```", "");
    out.push(`**CTA**: ${post.cta}`, "");
    out.push("**画像プロンプト（gpt-image-1）**", "", "```", post.imagePrompt, "```", "");
    out.push(
      `**動画**: motion=${post.video.motion} / ${post.video.durationSec}秒 / テロップ「${post.video.textOverlay}」`,
      "",
    );
    out.push(`**推奨投稿時間**: ${post.bestPostTime}`, "");
  }

  return out.join("\n");
}
