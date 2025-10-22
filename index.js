import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';

const app = express();

/**
 * ✅ Cloud Run (Gen2) 用ヘルスチェック
 * このルートが即時 200 OK を返さないとデプロイ失敗します。
 */
app.get('/', (_, res) => {
  res.status(200).send('✅ Discord Times Bot is running on Cloud Functions (Gen2)!');
});

// === 環境変数の確認 ===
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_PUBLIC_KEY || !DISCORD_TOKEN) {
  console.error('❌ 必要な環境変数が設定されていません');
  process.exit(1);
}

// === Discord からのリクエストを受け取る ===
app.post('/', verifyKeyMiddleware(DISCORD_PUBLIC_KEY), async (req, res) => {
  const interaction = req.body;

  // --- PING ---
  if (interaction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // --- Slash Command 処理 ---
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name } = interaction.data;

    // ✅ /make-times コマンド
    if (name === 'make-times') {
      const guildId = interaction.guild_id;
      const username = interaction.member.user.username;
      const userId = interaction.member.user.id;
      const channelName = `times-${username.toLowerCase()}`;

      try {
        // Discord APIでチャンネル作成
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${DISCORD_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: channelName,
            type: 0, // テキストチャンネル
            topic: `${username}'s times channel`,
            permission_overwrites: [
              {
                id: guildId,
                type: 0, // everyone
                deny: '1024', // メッセージ送信を禁止
              },
              {
                id: userId,
                type: 1, // メンバー
                allow: '1024', // メッセージ送信を許可
              },
            ],
          }),
        });

        if (response.ok) {
          const channel = await response.json();
          console.log(`✅ Created channel: #${channel.name}`);

          // --- 成功レスポンス ---
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ チャンネル <#${channel.id}> を作成しました！`,
            },
          });
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to create channel:', errorText);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ チャンネル作成に失敗しました。',
            },
          });
        }
      } catch (err) {
        console.error('🔥 Error creating channel:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '⚠️ 予期せぬエラーが発生しました。',
          },
        });
      }
    }

    // 未知のコマンド
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '❓ 未知のコマンドです。' },
    });
  }

  // --- その他のタイプ ---
  return res.status(400).send({ error: 'Unknown interaction type' });
});

/**
 * ✅ Cloud Functions (Gen2) 注意点
 * Functions Framework が自動的に listen() するので
 * app.listen() は不要です（入れると EADDRINUSE が出ます）。
 */
export const discordBot = app;
