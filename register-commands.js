// Discord に /make-times スラッシュコマンドを登録するスクリプト

import 'dotenv/config';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) {
  console.error('❌ DISCORD_TOKEN と DISCORD_APPLICATION_ID が必要です');
  process.exit(1);
}

// 登録するコマンドの定義
const commands = [
  {
    name: 'make-times',
    description: 'timesチャンネルを作成します',
    type: 1, // CHAT_INPUT
  },
];

// Discord API に登録
async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

  try {
    console.log('📝 コマンドを登録中...');

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('✅ コマンド登録成功:', data);
    console.log('\n登録されたコマンド:');
    data.forEach((cmd) => {
      console.log(`  /${cmd.name} - ${cmd.description}`);
    });
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
    process.exit(1);
  }
}

registerCommands();
