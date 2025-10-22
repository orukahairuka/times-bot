// シンプル化されたDiscord Times Bot - リアクション発火 + 最小限コマンド
import 'dotenv/config';
import fs from 'node:fs/promises';
import {
    Client,
    GatewayIntentBits,
    ChannelType,
    Partials,
} from 'discord.js';

/** ====== 基本設定 ====== */
const PREFIX = '!'; // コマンドの接頭辞
const DEFAULT_CATEGORY_NAME = 'times'; // すべてのtimesチャンネルはこのカテゴリに作成
const CHANNEL_PREFIX = 'times-'; // 個人チャンネル名の接頭辞
const CONFIG_PATH = './config.json'; // 設定保存先
/** ====================== */

// 初期設定（起動時に config.json があれば読み込む）
let config = {
    // リアクショントリガー
    trigger: {
        messageId: '', // 特定メッセージに限定するならここ
        channelId: '', // チャンネル全体で許可したいならここ
        emoji: '✅',
    },
};

async function loadConfig() {
    try {
        const txt = await fs.readFile(CONFIG_PATH, 'utf8');
        const obj = JSON.parse(txt);
        // 既存キーとマージ
        config = {...config, ...obj };
        console.log('Config loaded:', config);
    } catch {
        console.log('No config file, using defaults.');
    }
}
async function saveConfig() {
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save config:', e);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages, // コマンド受信
        GatewayIntentBits.MessageContent, // メッセージ本文
        GatewayIntentBits.GuildMessageReactions, // リアクション発火
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// チャンネル名サニタイズ
function sanitizeForChannelName(name) {
    const ascii = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w-]+/g, '-')
        .replace(/_+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return ascii || 'user';
}

// 既存個人timesを探す（常に"times"カテゴリ内で検索）
function findExistingTimesChannel(guild, member) {
    const base = sanitizeForChannelName(member.user.username);
    const expected = `${CHANNEL_PREFIX}${base}`;
    return guild.channels.cache.find(
        (c) =>
        c.type === ChannelType.GuildText &&
        c.name === expected &&
        c.parent?.name === DEFAULT_CATEGORY_NAME
    );
}

// カテゴリ取得 or 作成
async function ensureCategory(guild, categoryName) {
    let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === categoryName
    );
    if (!category) {
        category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            reason: `カテゴリ自動作成: ${categoryName}`,
        });
    }
    return category;
}

// 個人times作成（常に"times"カテゴリ、誰でも閲覧・投稿OK）
async function createPersonalTimes(guild, member) {
    const category = await ensureCategory(guild, DEFAULT_CATEGORY_NAME);

    // 二重作成防止
    const existing = findExistingTimesChannel(guild, member);
    if (existing) return existing;

    const base = sanitizeForChannelName(member.user.username);
    const name = `${CHANNEL_PREFIX}${base}`.slice(0, 90);

    // デフォルト権限で作成（permissionOverwritesなし = 誰でもアクセス可能）
    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `times作成: ${member.user.tag}`,
    });

    await channel.send(
        `ようこそ <@${member.id}> さん！ここがあなたの **times** です。\n` +
        `日報・メモ・進捗など自由にどうぞ。`
    );

    return channel;
}

/* ===== イベント: リアクション ===== */

client.on('messageReactionAdd', async(reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const { message } = reaction;
        const guild = message.guild;
        if (!guild) return;

        const { messageId, channelId, emoji } = config.trigger;
        if (emoji && reaction.emoji.name !== emoji) return;
        if (messageId && message.id !== messageId) return;
        if (channelId && message.channel.id !== channelId) return;

        const member = await guild.members.fetch(user.id);
        const channel = await createPersonalTimes(guild, member);
        await message.channel.send(
            `<@${user.id}> あなたの times を作成しました → ${channel}`
        );
        try { await reaction.users.remove(user.id); } catch {}
    } catch (e) {
        console.error('リアクション発火エラー:', e);
    }
});

/* ===== コマンド（committeeロール保持者のみ実行可能）===== */

client.on('messageCreate', async(msg) => {
    try {
        if (!msg.guild) return;
        if (msg.author.bot) return;
        if (!msg.content.startsWith(PREFIX)) return;

        const member = await msg.guild.members.fetch(msg.author.id);

        // committeeロールチェック（ロール名に"committee"を含むか）
        const hasCommitteeRole = member.roles.cache.some(role =>
            role.name.toLowerCase().includes('committee')
        );

        if (!hasCommitteeRole) {
            return msg.reply('このコマンドはCommitteeロール保持者のみ使用できます。');
        }

        const [cmd, ...rest] = msg.content.slice(PREFIX.length).trim().split(/\s+/);
        const lower = cmd?.toLowerCase();

        // !make-times (自分用 or メンション指定)
        if (lower === 'make-times') {
            const mentions = msg.mentions.users;

            if (mentions.size === 0) {
                // 自分用times作成
                try {
                    const channel = await createPersonalTimes(msg.guild, member);
                    return msg.reply(`✅ あなたの times → ${channel}`);
                } catch (error) {
                    console.error('自分用times作成エラー:', error);
                    return msg.reply('❌ times作成に失敗しました。');
                }
            } else {
                // メンション指定で複数作成
                const results = [];
                for (const [userId, user] of mentions) {
                    try {
                        const targetMember = await msg.guild.members.fetch(userId);
                        const channel = await createPersonalTimes(msg.guild, targetMember);
                        results.push(`✅ ${user.tag} → ${channel}`);
                    } catch (error) {
                        console.error(`${user.tag}のtimes作成エラー:`, error);
                        results.push(`❌ ${user.tag} の作成に失敗`);
                    }
                }
                return msg.reply(results.join('\n'));
            }
        }

        // !set-trigger メッセージID 絵文字
        if (lower === 'set-trigger') {
            const messageId = rest[0];
            const emoji = rest[1] || '✅';
            if (!messageId) return msg.reply('使い方: `!set-trigger メッセージID ✅`');
            config.trigger.messageId = messageId;
            config.trigger.emoji = emoji;
            await saveConfig();
            return msg.reply(`トリガー設定: messageId=${messageId}, emoji=${emoji}`);
        }

        // !status
        if (lower === 'status') {
            const lines = [
                `Category: \`${DEFAULT_CATEGORY_NAME}\`（すべてのtimesチャンネルをここに作成）`,
                `権限: 誰でも閲覧・投稿OK`,
                `Trigger: messageId=\`${config.trigger.messageId || '-'}\`, channelId=\`${config.trigger.channelId || '-'}\`, emoji=\`${config.trigger.emoji || '-'}\``,
            ];
            return msg.reply(lines.join('\n'));
        }

        return msg.reply('未知のコマンドです。利用可能: `!make-times`, `!set-trigger`, `!status`');
    } catch (e) {
        console.error('コマンド処理エラー:', e);
    }
});

client.once('ready', async() => {
    await loadConfig();
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);