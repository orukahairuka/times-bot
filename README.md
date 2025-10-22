# Discord Times Bot - Cloud Functions (Gen 2) 版

Cloud Functions (Gen 2) で動作する Discord Slash Command Bot です。

## 📋 前提条件

- Node.js 20
- Google Cloud プロジェクト
- gcloud CLI がインストール済み
- Discord アプリケーション（Discord Developer Portal で作成）

## 🚀 セットアップ手順

### 1. Discord アプリケーションの設定

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 新しいアプリケーションを作成
3. 以下の情報を取得：
   - **Application ID** (General Information > Application ID)
   - **Public Key** (General Information > Public Key)
   - **Bot Token** (Bot > Token - "Reset Token" をクリック)

### 2. 環境変数の設定

`.env` ファイルを作成：

```bash
cp .env.example .env
```

`.env` ファイルに Discord の情報を記入：

```env
DISCORD_APPLICATION_ID=your_application_id_here
DISCORD_PUBLIC_KEY=your_public_key_here
DISCORD_TOKEN=your_bot_token_here
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. Cloud Functions へのデプロイ

**重要**: デプロイ前に gcloud CLI でログインし、プロジェクトを設定してください。

```bash
# GCP プロジェクトを設定
gcloud config set project YOUR_PROJECT_ID

# Cloud Functions (Gen 2) にデプロイ
gcloud functions deploy discordBot \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-northeast1 \
  --source=. \
  --entry-point=discordBot \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars DISCORD_PUBLIC_KEY=your_public_key_here
```

**環境変数の設定方法（推奨）**:

```bash
# より安全な方法: Secret Manager を使用
gcloud functions deploy discordBot \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-northeast1 \
  --source=. \
  --entry-point=discordBot \
  --trigger-http \
  --allow-unauthenticated \
  --set-secrets 'DISCORD_PUBLIC_KEY=discord-public-key:latest'
```

### 5. Interactions Endpoint URL の設定

デプロイが完了したら、Functions の URL が表示されます：

```
https://asia-northeast1-YOUR_PROJECT_ID.cloudfunctions.net/discordBot
```

この URL を Discord Developer Portal に登録：

1. Discord Developer Portal > 該当アプリケーション > General Information
2. **INTERACTIONS ENDPOINT URL** に上記 URL を入力
3. "Save Changes" をクリック

Discord が自動的に PING テストを実行します。✅ が表示されれば成功です！

### 6. スラッシュコマンドの登録

```bash
npm run register
```

成功すると以下のように表示されます：

```
✅ コマンド登録成功
登録されたコマンド:
  /make-times - timesチャンネルを作成します
```

## 🎮 使い方

Discord サーバーで `/make-times` と入力すると：

```
✅ timesコマンドを受信しました！
```

と返信されます。

## 📝 ファイル構成

```
times-bot/
├── index.js                # Cloud Functions のメインファイル
├── register-commands.js    # スラッシュコマンド登録スクリプト
├── package.json           # 依存関係とスクリプト
├── .env                   # 環境変数（非公開）
├── .env.example           # 環境変数のテンプレート
└── README.md             # このファイル
```

## 🔧 トラブルシューティング

### "Function 'helloHttp' not defined" エラーが出る場合

`--entry-point=discordBot` を指定してください。これは `index.js` でエクスポートしている関数名と一致させる必要があります。

### "container failed to start" エラーが出る場合

1. `package.json` で `"type": "module"` が設定されているか確認
2. `--runtime=nodejs20` が指定されているか確認
3. `DISCORD_PUBLIC_KEY` 環境変数が正しく設定されているか確認

### PING テストが失敗する場合

1. `--allow-unauthenticated` が設定されているか確認（Discord からのリクエストを受け付けるため）
2. Cloud Functions のログを確認：`gcloud functions logs read discordBot --region=asia-northeast1`

## 🔍 ログの確認

```bash
# リアルタイムでログを表示
gcloud functions logs read discordBot \
  --region=asia-northeast1 \
  --limit=50

# ログをフォロー
gcloud functions logs tail discordBot \
  --region=asia-northeast1
```

## 📚 参考資料

- [Discord Interactions API](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [Google Cloud Functions (Gen 2)](https://cloud.google.com/functions/docs/2nd-gen/overview)
- [discord-interactions npm package](https://www.npmjs.com/package/discord-interactions)
