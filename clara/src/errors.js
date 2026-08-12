import Anthropic from "@anthropic-ai/sdk";

/** APIエラーを日本語1文にする。CLIと画面の両方から使う。 */
export function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "APIキーが正しくないようです。キーを入れ直してください。";
  }
  if (error instanceof Anthropic.NotFoundError) {
    return `モデルが見つかりません。モデル名の指定を確認してください。（${error.message}）`;
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "アクセスが集中しています。1分ほど待ってからもう一度お試しください。";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "インターネットに接続できませんでした。回線を確認してください。";
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 400 && /credit|billing/i.test(error.message)) {
      return "APIの残高が不足しているようです。Anthropicの管理画面でチャージしてください。";
    }
    return `APIエラー（${error.status}）: ${error.message}`;
  }
  return error.message;
}
