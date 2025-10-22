# times-bot

Discord用の個人timesチャンネル生成BOT（シンプル版）

## 機能
- リアクションによるtimesチャンネル作成
- 必要最小限のコマンド
- ロールベースのカテゴリ振り分け
- プライベートチャンネル設定対応（Committee ロールは閲覧可能）

## 管理者・Committee ロール専用コマンド

以下のコマンドは、**管理者または Committee ロールを持つユーザーのみ使用可能**です。

| コマンド          | 説明                                     | 使用例                                         |
|-------------------|------------------------------------------|------------------------------------------------|
| `!make-times`     | timesチャンネルを作成（自分用/指定ユーザー用） | `!make-times` または `!make-times @user1 @user2` |
| `!set-trigger`    | リアクションによるトリガーを設定         | `!set-trigger <メッセージID> ✅`               |
| `!status`         | 現在の設定状態を表示                     | `!status`                                      |

## セットアップ

### 1. `.env`ファイルを作成し、Discord BOTトークンを設定
```
DISCORD_TOKEN=your-bot-token-here
```

### 2. 依存関係のインストール
```bash
npm install
```

### 3. BOTの起動
```bash
npm start
```

### 4. リアクショントリガーの設定
1. 任意のチャンネルにメッセージを投稿
2. メッセージIDをコピー（開発者モードで右クリック→IDをコピー）
3. `!set-trigger <メッセージID> 🐈` でトリガー設定
4. ユーザーがそのメッセージに絵文字リアクションするとtimesチャンネルが作成されます

## 設定

### 基本設定（`index.js`内の定数）
- `PREFIX`: コマンドの接頭辞（デフォルト: `!`）
- `DEFAULT_CATEGORY_NAME`: デフォルトカテゴリ名（デフォルト: `times`）
- `CHANNEL_PREFIX`: チャンネル名の接頭辞（デフォルト: `times-`）
- `PRIVATE_TO_MEMBER`: プライベートチャンネル設定（デフォルト: `true`）

### 動的設定（`config.json`）
起動時に自動で `config.json` を読み込みます。存在しない場合はデフォルト設定で動作します。

```json
{
  "roleToCategory": {
    "ロールID": "カテゴリ名"
  },
  "trigger": {
    "messageId": "メッセージID",
    "channelId": "",
    "emoji": "✅"
  }
}
```

### カテゴリ振り分けルール
1. **明示的マッピング**: `config.json` の `roleToCategory` に設定されたロールIDとカテゴリ名のマッピング
2. **自動判定**: ロール名に「27卒」「2027年卒」「27期」などが含まれる場合、自動的に `27-times` カテゴリに振り分け
3. **デフォルト**: 上記に該当しない場合は `DEFAULT_CATEGORY_NAME` カテゴリに作成

## 権限設定

### Committeeロール
- 名前に "committee" が含まれるロールは、全てのプライベートtimesチャンネルを閲覧可能（書き込み不可）

### Discord Developer Portal で必要な設定
1. **Bot Intents** で以下を有効化:
   - `PRESENCE INTENT`
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
