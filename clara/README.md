# Clara MVP — SNS自動投稿パイプライン

ビジネス説明文から Instagram 投稿を自動生成するパイプラインの最小動作版。
`vjl-pipeline.js` 的な「1コマンドで完結する Node スクリプト」として組んでいます。

現在実装済みなのは **ステップ①（企画・キャプション生成）** のみ。
②以降は「拡張の進め方」に接続方法を書いてあります。

```
① 企画・キャプション生成   Claude API        ← 実装済み
② 画像生成                 gpt-image-1        ← 未実装
③ 動画加工                 ffmpeg             ← 未実装
④ 投稿                     Instagram Graph API ← 未実装
```

---

## セットアップ

```bash
cd clara
npm install
cp .env.example .env      # Windows: copy .env.example .env
# .env を開いて ANTHROPIC_API_KEY を入れる
```

Node.js 18.17 以上が必要です（`node -v` で確認）。

## 使い方

```bash
# 基本
node clara.js plan --brief "東京・蔵前のシングルオリジン豆専門の自家焙煎ロースタリー"

# 説明文が長いときはファイルで渡す
node clara.js plan --brief-file ./brief.txt --tone "落ち着いた大人向け"

# APIを呼ばずにプロンプトだけ確認
node clara.js plan --brief "..." --dry-run

# ヘルプ
node clara.js help
```

主なオプション:

| オプション | 説明 |
| --- | --- |
| `--brief <text>` / `--brief-file <path>` | ビジネス説明文（どちらか必須） |
| `--count <n>` | 投稿案の件数（既定 3、最大 3） |
| `--tone <text>` | トーン指定 |
| `--notes <text>` | 住所・営業時間・キャンペーンなどの補足 |
| `--effort <level>` | `low` / `medium` / `high` / `xhigh` / `max`（既定 `medium`） |
| `--model <id>` | 既定は `claude-opus-5` |
| `--out <dir>` | 出力先の親ディレクトリ（既定 `./output`） |
| `--dry-run` | API を呼ばずプロンプトだけ表示 |

## 出力

`output/20260812-143000/` のような実行ごとのフォルダに2ファイル。

- **`plan.json`** — 後続ステップが読む正データ（スキーマ検証済み）
- **`plan.md`** — 人が読む用。キャプションと画像プロンプトをコピペしやすい形

`plan.json` の形:

```jsonc
{
  "meta": { "model": "...", "usage": { ... }, "brief": "...", "userPrompt": "..." },
  "plan": {
    "businessProfile": { "summary", "category", "targetAudience", "brandTone", "keywords" },
    "posts": [
      {
        "id": "post-1",
        "angle": "共感・ストーリー",     // 3案で必ず切り口を変える
        "concept": "...",
        "hook": "1行目のフック",
        "caption": "本文（ハッシュタグは含まない）",
        "hashtags": ["#...", "..."],
        "cta": "...",
        "imagePrompt": "gpt-image-1 に渡す英語プロンプト",   // → ステップ②
        "video": {
          "motion": "ken_burns_in",     // → ステップ③ ffmpeg のプリセット名
          "durationSec": 8,
          "textOverlay": "焼き込むテロップ"
        },
        "bestPostTime": "平日 12:00〜13:00"
      }
    ]
  }
}
```

`angle` と `video.motion` は列挙値に固定しているので、後続ステップで `switch` を書けます。
出力は Claude の Structured Outputs でスキーマ強制しているため、`JSON.parse` が失敗する・
キーが欠けるといったことは起きません（プロンプト頼みのJSON生成との一番の違い）。

## 設計メモ

- **API呼び出しは1回**。3案をまとめて1レスポンスで作らせています。案ごとに呼ぶより
  「切り口が被らない」制御がしやすく、コストも1/3。
- **`imagePrompt` は英語**。gpt-image-1 に渡す前提で、文字・ロゴを描画しない指示を
  システムプロンプト側で常に入れています。
- **捏造の禁止**をシステムプロンプトで明示。説明文にない受賞歴・数値・所在地は書きません。
  逆に言うと `--notes` で事実を渡すほど具体的な投稿案になります。
- **依存は `@anthropic-ai/sdk` だけ**。`.env` の読み込みも自前の小さいパーサーで、
  dotenv も入れていません。

## 拡張の進め方（②〜④）

すべて `plan.json` を入力にして、同じフォルダに成果物を足していく形を想定しています。

### ② 画像生成 — `node clara.js image --run output/2026...`
`posts[].imagePrompt` を gpt-image-1 に渡し、`images/post-1.png` として保存。
既存の画像生成パイプラインをそのまま `src/image.js` に移植できます。
Instagram のフィードは 1080x1350（4:5）、リールは 1080x1920（9:16）なので、
動画に回す分は 9:16 で生成しておくと ③ でのクロップが不要になります。

### ③ 動画加工 — `node clara.js video --run output/2026...`
`video.motion` を ffmpeg のフィルタに対応させるだけの表引きにします。

```js
const MOTION_FILTERS = {
  ken_burns_in:  "zoompan=z='min(zoom+0.0015,1.2)':d=DURATION:s=1080x1920",
  ken_burns_out: "zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0015))':d=DURATION:s=1080x1920",
  pan_left:      "zoompan=z=1.2:x='iw*0.2-on*0.3':d=DURATION:s=1080x1920",
  pan_right:     "zoompan=z=1.2:x='on*0.3':d=DURATION:s=1080x1920",
};
```

`textOverlay` は `drawtext` で焼き込み（日本語フォントの `fontfile` 指定が必要）。
VJL/Shorts で使っている ffmpeg 処理をここに寄せます。

### ④ 投稿 — `node clara.js post --run output/2026... --post post-1`
Instagram Graph API（Account ID: `17841402134004209`）で

1. `POST /{ig-user-id}/media` でコンテナ作成（`image_url` または `video_url` + `caption`）
2. `POST /{ig-user-id}/media_publish` で公開

の2段階。**注意点として、Graph API に「下書き保存」のエンドポイントはありません。**
コンテナを作った時点では未公開ですが、これは下書きではなく一時的な入れ物で、
アプリ上の下書きにも現れません（有効期限あり）。
「確認してから出す」を実現するなら、
`plan.json` に `approved: true` を書き込んでから `post` コマンドを実行する、という
ローカルの承認フローを挟むのが現実的です。スケジューリングは `auto_post.js` の仕組みを流用。

また、メディアは公開URLから取得される仕様なので、生成した画像・動画を
どこかにホスティングする必要があります（S3 / Cloudflare R2 / 自サイトなど）。

---

## 動作確認の状況

- `--dry-run`、ヘルプ、出力ファイル生成（モックデータ）までは実行して確認済み。
- **API を実際に叩く経路は未検証**です（この作業環境に `ANTHROPIC_API_KEY` がないため）。
  手元で `.env` を設定して 1 回流してみてください。エラーが出たらそのメッセージを共有いただければ直します。
