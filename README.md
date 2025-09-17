# times-bot

Discord用の個人timesチャンネル自動生成BOT

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