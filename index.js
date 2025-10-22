// Cloud Functions (Gen 2) で動作する Discord Slash Command Bot
// Express + discord-interactions を使用

import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';

const app = express();

// 環境変数の検証
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

if (!DISCORD_PUBLIC_KEY) {
  console.error('❌ DISCORD_PUBLIC_KEY が設定されていません');
  process.exit(1);
}

// discord-interactions の署名検証ミドルウェア
// Discord からのリクエストのみを受け付ける
app.post('/', verifyKeyMiddleware(DISCORD_PUBLIC_KEY), async (req, res) => {
  const interaction = req.body;

  console.log('📨 Interaction received:', JSON.stringify(interaction, null, 2));

  // Discord からの PING (接続確認) に応答
  if (interaction.type === InteractionType.PING) {
    console.log('🏓 PING received');
    return res.send({
      type: InteractionResponseType.PONG,
    });
  }

  // スラッシュコマンドの処理
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name } = interaction.data;

    console.log('🔧 Command received:', name);

    // /make-times コマンドの処理
    if (name === 'make-times') {
      console.log('✅ make-times command executed');
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ timesコマンドを受信しました！',
        },
      });
    }

    // その他のコマンドの場合
    console.log('❌ Unknown command:', name);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '未知のコマンドです',
      },
    });
  }

  // それ以外の Interaction タイプ
  console.log('❌ Unknown interaction type:', interaction.type);
  return res.status(400).send({ error: 'Unknown interaction type' });
});

// ヘルスチェック用エンドポイント（オプション）
app.get('/', (req, res) => {
  res.send('Discord Times Bot is running on Cloud Functions! 🚀');
});

// Cloud Functions (Gen 2) 用のエクスポート
// app.listen() は不要 - Cloud Functions が自動的にサーバーを起動
export const discordBot = app;
