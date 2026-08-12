/**
 * 企画・キャプション生成の出力スキーマ（Structured Outputs 用）。
 *
 * ここで決めた形が、そのまま後続ステップの入力になる:
 *   imagePrompt      -> ③ gpt-image-1 への渡し値
 *   video.motion     -> ④ ffmpeg のモーションプリセット名
 *   caption/hashtags -> ⑤ Instagram Graph API の caption
 *
 * 注意: Structured Outputs は minLength / maxItems などの制約は非対応。
 * 個数や文字数の指示は description とプロンプト側で行う。
 */
export const POST_ANGLES = ["共感・ストーリー", "実用・ノウハウ", "世界観・ビジュアル"];

export const VIDEO_MOTIONS = [
  "ken_burns_in",
  "ken_burns_out",
  "pan_left",
  "pan_right",
];

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["businessProfile", "posts"],
  properties: {
    businessProfile: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "category", "targetAudience", "brandTone", "keywords"],
      properties: {
        summary: { type: "string", description: "ビジネスの要約（日本語・80字以内）" },
        category: { type: "string", description: "業種カテゴリ（例: カフェ／飲食）" },
        targetAudience: { type: "string", description: "主なターゲット層（日本語）" },
        brandTone: { type: "string", description: "ブランドのトーン&マナー（日本語）" },
        keywords: {
          type: "array",
          description: "ブランドを表すキーワード 5個程度（日本語）",
          items: { type: "string" },
        },
      },
    },
    posts: {
      type: "array",
      description: "投稿案。指定された件数ちょうど、angle は重複させない。",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "angle",
          "concept",
          "hook",
          "caption",
          "hashtags",
          "cta",
          "imagePrompt",
          "video",
          "bestPostTime",
        ],
        properties: {
          id: { type: "string", description: "post-1 のような連番ID" },
          angle: { type: "string", enum: POST_ANGLES, description: "投稿の切り口" },
          concept: { type: "string", description: "この投稿で何を伝えるか（日本語・1〜2文）" },
          hook: { type: "string", description: "1行目に置くフック（日本語・25字以内が目安）" },
          caption: {
            type: "string",
            description:
              "Instagram本文（日本語・250〜400字目安）。ハッシュタグは含めない。改行は \\n で表現する。",
          },
          hashtags: {
            type: "array",
            description: "# を含むハッシュタグ 10〜15個。日本語・英語を混在させる。",
            items: { type: "string" },
          },
          cta: { type: "string", description: "行動喚起の一文（日本語）" },
          imagePrompt: {
            type: "string",
            description:
              "gpt-image-1 に渡す英語プロンプト。被写体・構図・光・色調・質感を具体的に。文字やロゴは入れない指示を含める。",
          },
          video: {
            type: "object",
            additionalProperties: false,
            required: ["motion", "durationSec", "textOverlay"],
            properties: {
              motion: {
                type: "string",
                enum: VIDEO_MOTIONS,
                description: "ffmpegで適用するモーションプリセット",
              },
              durationSec: { type: "integer", description: "動画尺（秒）。6〜15の範囲。" },
              textOverlay: { type: "string", description: "動画に焼き込む短いテキスト（15字以内）" },
            },
          },
          bestPostTime: { type: "string", description: "推奨投稿時間帯（例: 平日 12:00〜13:00）" },
        },
      },
    },
  },
};
