# times-bot

Discord用の個人timesチャンネル自動生成BOT

## 管理者・Committee ロール専用コマンド

以下のコマンドは、**管理者または Committee ロールを持つユーザーのみ使用可能**です。

| コマンド          | 説明                                     | 使用例                                         |
|-------------------|------------------------------------------|------------------------------------------------|
| `!add-role`       | ロールとカテゴリのマッピングを追加       | `!add-role @27卒 27-times`                     |
| `!remove-role`    | 既存のロールマッピングを削除             | `!remove-role @27卒`                           |
| `!list-roles`     | 現在のロールマッピング一覧を表示         | `!list-roles`                                  |
| `!set-trigger`    | リアクションによるトリガーを設定         | `!set-trigger <メッセージID> ✅`               |
| `!clear-trigger`  | 設定済みのトリガーをクリア               | `!clear-trigger`                               |
| `!make-times`     | timesチャンネルを作成（自分用/指定ユーザー用） | `!make-times` または `!make-times @user1 @user2` |
| `!recreate-times` | 既存timesを削除して再作成               | `!recreate-times @user1 @user2`                |
| `!status`         | 現在の設定状態を表示                     | `!status`                                      |


## 機能
- サーバー参加時に個人timesを自動作成
- 退出時に個人timesを自動削除
- リアクションによる手動作成機能
- プライベートチャンネル設定対応

## セットアップ
1. `.env`ファイルを作成し、Discord BOTトークンを設定
```
DISCORD_TOKEN=your-bot-token-here
```

2. 依存関係のインストール
```bash
npm install
```

3. BOTの起動
```bash
npm start
```

## 設定
`index.js`内の定数で動作をカスタマイズ可能：
- `CATEGORY_NAME`: timesカテゴリ名
- `CHANNEL_PREFIX`: チャンネル名の接頭辞
- `TRIGGER_MESSAGE_ID`: リアクション対象メッセージID
- `TRIGGER_EMOJI`: トリガー絵文字
- `PRIVATE_TO_MEMBER`: プライベートチャンネル設定
