// Cloud Functions (Gen 2) で動作する Discord Slash Command Bot
// Express + discord-interactions を使用

import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';

// === Express アプリ作成 ===
const app = express();

// ✅ express.json() は不要！
// verifyKeyMiddleware が Discord の署名検証と raw body の解析を担当するため。

// === 環境変数の検証 ===
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

if (!DISCORD_PUBLIC_KEY) {
  console.error('❌ DISCORD_PUBLIC_KEY が設定されていません');
  process.exit(1);
}

// === Discord からのリクエスト受付 ===
app.post('/', verifyKeyMiddleware(DISCORD_PUBLIC_KEY), async (req, res) => {
  const interaction = req.body;
  console.log('📨 Interaction received:', JSON.stringify(interaction, null, 2));

  // 🔹 Discord からの PING（接続確認）
  if (interaction.type === InteractionType.PING) {
    console.log('🏓 PING received');
    return res.send({
      type: InteractionResponseType.PONG,
    });
  }

  // 🔹 Slash Command の処理
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name } = interaction.data;
    console.log('🔧 Command received:', name);

    // ✅ /make-times コマンド
    if (name === 'make-times') {
      console.log('✅ make-times command executed');
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ timesコマンドを受信しました！',
        },
      });
    }

    // 🔸 未知のコマンド
    console.log('❌ Unknown command:', name);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '未知のコマンドです',
      },
    });
  }

  // 🔸 その他のタイプ
  console.log('❌ Unknown interaction type:', interaction.type);
  return res.status(400).send({ error: 'Unknown interaction type' });
});

// === ヘルスチェック用 ===
app.get('/', (req, res) => {
  res.send('Discord Times Bot is running on Cloud Functions! 🚀');
});

// === Cloud Functions (Gen 2) 用のエクスポート ===
// app.listen() は不要。Cloud Functions が自動でHTTPサーバーを起動します。
export const discordBot = app;
