/**
 * Instagram Graph API（コンテンツ公開）。
 *
 * 手順は2段階:
 *   1. POST /{ig-user-id}/media          … 画像URLとキャプションでコンテナを作る
 *   2. POST /{ig-user-id}/media_publish  … コンテナIDを渡して公開
 *
 * 画像は「外部から見えるHTTPS URL」である必要がある（Metaのサーバーが取りに来るため）。
 * ローカルのファイルパスは使えない。
 */

const DEFAULT_VERSION = "v26.0";

function graphBase() {
  return process.env.IG_GRAPH_BASE || "https://graph.facebook.com";
}

function apiVersion() {
  return process.env.IG_API_VERSION || DEFAULT_VERSION;
}

export class InstagramError extends Error {
  constructor(message, { code, subcode, raw } = {}) {
    super(message);
    this.name = "InstagramError";
    this.code = code;
    this.subcode = subcode;
    this.raw = raw;
  }
}

/** Metaのエラーコードを日本語の対処に翻訳する。 */
function translate(error) {
  const code = error?.code;
  const subcode = error?.error_subcode;
  const message = error?.message ?? "不明なエラー";

  if (code === 190) {
    return "アクセストークンの有効期限が切れているか、無効です。トークンを取り直して登録し直してください。";
  }
  if (code === 200 || code === 10 || code === 3) {
    return "この操作に必要な権限がトークンにありません。instagram_content_publish の権限を含めて発行し直してください。";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "投稿の上限に達しています。Instagramでは24時間あたり25件までです。しばらく待ってから試してください。";
  }
  if (subcode === 2207052 || /not.*accessible|could not.*fetch|download.*fail/i.test(message)) {
    return "画像URLにInstagram側からアクセスできませんでした。誰でも開けるHTTPSのURLか確認してください（Googleドライブの共有リンクは使えないことが多いです）。";
  }
  if (subcode === 2207004 || /aspect ratio/i.test(message)) {
    return "画像の縦横比がInstagramの許容範囲外です。4:5〜1.91:1（正方形や縦長）に収めてください。";
  }
  if (subcode === 2207003 || /file size|too large/i.test(message)) {
    return "画像のファイルサイズが大きすぎます（8MB以内が目安）。";
  }
  if (/Unsupported.*version|Unknown path/i.test(message)) {
    return `APIのバージョン指定が無効です（現在: ${apiVersion()}）。.env の IG_API_VERSION を見直してください。`;
  }
  return `Instagram側のエラー: ${message}`;
}

async function callGraph(pathname, { method = "GET", params = {}, token }) {
  const url = new URL(`${graphBase()}/${apiVersion()}/${pathname}`);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (method === "GET") url.searchParams.set(key, String(value));
    else body.set(key, String(value));
  }

  const headers = { Authorization: `Bearer ${token}` };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";

  let response;
  try {
    response = await fetch(url, { method, headers, body: method === "POST" ? body : undefined });
  } catch (cause) {
    throw new InstagramError("Instagramに接続できませんでした。ネットワークを確認してください。", { raw: cause });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    throw new InstagramError(translate(data.error), {
      code: data.error?.code,
      subcode: data.error?.error_subcode,
      raw: data.error,
    });
  }
  return data;
}

/** トークンが有効かを確認し、繋がっているアカウント名を返す。 */
export async function verifyAccount({ userId, token }) {
  const data = await callGraph(userId, {
    params: { fields: "username,name" },
    token,
  });
  return { username: data.username, name: data.name };
}

/** 画像コンテナを作る（この時点ではまだ公開されない）。 */
export async function createImageContainer({ userId, token, imageUrl, caption }) {
  const data = await callGraph(`${userId}/media`, {
    method: "POST",
    params: { image_url: imageUrl, caption },
    token,
  });
  return data.id;
}

/** コンテナの準備が終わるまで待つ。画像は通常すぐ FINISHED になる。 */
export async function waitUntilReady({ containerId, token, attempts = 10, intervalMs = 1500 }) {
  for (let i = 0; i < attempts; i++) {
    const data = await callGraph(containerId, {
      params: { fields: "status_code,status" },
      token,
    });

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new InstagramError(
        `画像の準備に失敗しました（${data.status_code}）。${data.status ?? ""}`.trim(),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new InstagramError("画像の準備が時間内に終わりませんでした。もう一度お試しください。");
}

/** コンテナを公開する。ここで実際に投稿される。 */
export async function publishContainer({ userId, token, creationId }) {
  const data = await callGraph(`${userId}/media_publish`, {
    method: "POST",
    params: { creation_id: creationId },
    token,
  });
  return data.id;
}

/** 公開後の投稿URLを取得する。取れなくても致命的ではない。 */
export async function getPermalink({ mediaId, token }) {
  try {
    const data = await callGraph(mediaId, { params: { fields: "permalink" }, token });
    return data.permalink ?? null;
  } catch {
    return null;
  }
}

/** 画像1枚を投稿する一連の流れ。 */
export async function publishImagePost({ userId, token, imageUrl, caption }) {
  const containerId = await createImageContainer({ userId, token, imageUrl, caption });
  await waitUntilReady({ containerId, token });
  const mediaId = await publishContainer({ userId, token, creationId: containerId });
  const permalink = await getPermalink({ mediaId, token });
  return { mediaId, permalink };
}
