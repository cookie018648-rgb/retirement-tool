import Anthropic from "@anthropic-ai/sdk";

import { DEFAULT_EFFORT, DEFAULT_MODEL } from "./config.js";
import { POST_ANGLES, planSchema } from "./schema.js";

const SYSTEM_PROMPT = `あなたは日本の中小事業者を専門に担当する Instagram のコンテンツプランナーです。
渡されたビジネス説明文から、その店・そのブランドにしか書けない投稿案を作ります。

守ること:
- 具体を書く。「こだわりの一杯」「特別なひととき」のような、どの店にも当てはまる言葉は使わない。
  豆の産地・焙煎度・器具・時間帯・音・温度など、事実として想像できるディテールで書く。
- 情報が説明文にない場合は、captionでは断定せず、業種として自然な範囲の描写にとどめる。
  嘘の実績・受賞歴・数値・所在地は絶対に作らない。
- 3つの投稿案は切り口を変える。同じ内容を言い換えただけの案は作らない。
- caption は日本語。1行目のフックで手を止めさせ、最後に自然な形でCTAにつなげる。
  ハッシュタグは caption 本文には入れず、hashtags 配列に分ける。
- imagePrompt は英語で書く。画像生成モデル（gpt-image-1）にそのまま渡す前提で、
  被写体・構図・レンズ感・光の向き・色調・質感を具体的に指定し、
  文字・ロゴ・透かしを描画しないことを明記する。人物を出す場合も顔の判別を強調しない。
- textOverlay は動画に焼き込む短い日本語。captionの繰り返しにしない。`;

const ANGLE_LIST = POST_ANGLES.map((a) => `「${a}」`).join(" / ");

export function buildUserPrompt({ brief, count, tone, extraNotes }) {
  const lines = [
    "以下のビジネスについて、Instagram の投稿案を作ってください。",
    "",
    "## ビジネス説明文",
    brief,
    "",
    "## 条件",
    `- 投稿案は ${count} 件。angle は ${ANGLE_LIST} から重複なく割り当てる。`,
    "- caption は 250〜400字目安、改行を使って読みやすくする。",
    "- hashtags は 10〜15個。ビッグワードだけでなく、検索母数の小さい具体的なタグも混ぜる。",
    "- video.durationSec は 6〜15 秒。縦型ショート（1080x1920）前提。",
  ];

  if (tone) lines.push(`- 全体のトーン指定: ${tone}`);
  if (extraNotes) lines.push("", "## 補足情報", extraNotes);

  return lines.join("\n");
}

/**
 * Claude を1回呼び、スキーマ検証済みの企画JSONを返す。
 */
export async function generatePlan({
  brief,
  count = 3,
  tone = "",
  extraNotes = "",
  model = process.env.CLARA_MODEL || DEFAULT_MODEL,
  effort = process.env.CLARA_EFFORT || DEFAULT_EFFORT,
}) {
  const client = new Anthropic();
  const userPrompt = buildUserPrompt({ brief, count, tone, extraNotes });

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort,
      format: { type: "json_schema", schema: planSchema },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unknown";
    throw new Error(
      `モデルが応答を拒否しました (category: ${category})。ビジネス説明文の内容を確認してください。`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("出力が max_tokens に達して途中で切れました。件数を減らして再実行してください。");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) throw new Error("テキストブロックが返りませんでした。");

  const plan = JSON.parse(textBlock.text);

  return {
    plan,
    meta: {
      model: response.model,
      effort,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      },
      generatedAt: new Date().toISOString(),
      brief,
      userPrompt,
    },
  };
}
