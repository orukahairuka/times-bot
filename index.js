// ロール→カテゴリ振り分け + リアクション発火 + 参加/退出 + 管理者用コマンド + 設定保存
import 'dotenv/config';
import fs from 'node:fs/promises';
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    ChannelType,
    Partials,
} from 'discord.js';

/** ====== ここを必要に応じて ====== */
const PREFIX = '!'; // 管理コマンドの接頭辞
const DEFAULT_CATEGORY_NAME = 'times'; // デフォルトカテゴリ
const CHANNEL_PREFIX = 'times-'; // 個人チャンネル名の接頭辞
const PRIVATE_TO_MEMBER = true; // 個人チャンネルを本人だけ見える設定にする
const CONFIG_PATH = './config.json'; // 設定保存先（Railwayだと再デプロイで消えることあり。永続化はDB推奨）
/** ================================== */

// 初期設定（起動時に config.json があれば読み込む）
let config = {
    // ロールID → カテゴリ名のマップ
    roleToCategory: {
        // 例: "1418212853873119334": "27-times",
    },
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
        GatewayIntentBits.GuildMembers, // 参加/退出
        GatewayIntentBits.GuildMessages, // メッセージ受信（管理コマンド）
        GatewayIntentBits.MessageContent, // メッセージ本文（管理コマンドに必要）
        GatewayIntentBits.GuildMessageReactions, // リアクション発火
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

const EVERYONE = (guild) => guild.roles.everyone.id;

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

// ロール→カテゴリ決定（マッピング優先、無ければ “◯◯卒/年卒/期” 自動判定）
function resolveCategoryNameFor(member) {
    // 1) 明示マッピングを優先
    for (const [roleId, category] of Object.entries(config.roleToCategory)) {
        if (member.roles.cache.has(roleId)) return category;
    }
    // 2) ロール名から自動判定（例: 27卒 / 2027年卒 / 27期）
    const yearPattern = /(?:20)?(\d{2})\s*(?:卒|年卒|期)/; // 27卒 / 2027年卒 / 27期 → "27"
    for (const role of member.roles.cache.values()) {
        const m = role.name.match(yearPattern);
        if (m) {
            const short = m[1]; // 末尾2桁
            return `${short}-times`;
        }
    }
    // 3) それでも決まらなければデフォルト
    return DEFAULT_CATEGORY_NAME;
}

// 既存個人timesをカテゴリ内で探す
function findExistingTimesChannel(guild, member, categoryName) {
    const base = sanitizeForChannelName(member.user.username);
    const expected = `${CHANNEL_PREFIX}${base}`;
    return guild.channels.cache.find(
        (c) =>
        c.type === ChannelType.GuildText &&
        c.name === expected &&
        c.parent?.name === categoryName
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

// 個人times作成
async function createPersonalTimes(guild, member) {
    const categoryName = resolveCategoryNameFor(member);
    const category = await ensureCategory(guild, categoryName);

    // 二重作成防止
    const existing = findExistingTimesChannel(guild, member, categoryName);
    if (existing) return existing;

    const base = sanitizeForChannelName(member.user.username);
    const name = `${CHANNEL_PREFIX}${base}`.slice(0, 90);
    const everyoneId = EVERYONE(guild);

    const permissionOverwrites = PRIVATE_TO_MEMBER ?
        [
            { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
            // Committeeロールに閲覧権限を追加
            ...guild.roles.cache
                .filter(role => role.name.toLowerCase().includes('committee'))
                .map(role => ({
                    id: role.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                })),
        ] :
        undefined;

    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites,
        reason: `times作成 (${categoryName}): ${member.user.tag}`,
    });

    await channel.send(
        `ようこそ <@${member.id}> さん！ここがあなたの **times** です（カテゴリ: **${categoryName}**）。\n` +
        `日報・メモ・進捗など自由にどうぞ。`
    );

    return channel;
}

/* ===== イベント: 参加 / 退出 / リアクション ===== */

client.on('guildMemberAdd', async(member) => {
    try {
        await createPersonalTimes(member.guild, member);
    } catch (e) {
        console.error('参加時times作成失敗:', e);
    }
});

client.on('guildMemberRemove', async(member) => {
    try {
        const guild = member.guild;
        if (!guild) return;

        const candidateCategories = [
            ...new Set([
                ...Object.values(config.roleToCategory),
                DEFAULT_CATEGORY_NAME,
            ]),
        ];

        for (const cat of candidateCategories) {
            const ch = findExistingTimesChannel(guild, member, cat);
            if (ch) {
                await ch.delete(`退出に伴うtimes削除: ${member.user?.tag ?? member.id}`);
                break;
            }
        }
    } catch (e) {
        console.error('退出時times削除失敗:', e);
    }
});

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

/* ===== 管理者用メッセージコマンド ===== */

function isAdminish(member) {
    // 管理者権限チェック
    if (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return true;
    }

    // Committeeロールチェック
    const hasCommitteeRole = member.roles.cache.some(role =>
        role.name.toLowerCase().includes('committee')
    );

    return hasCommitteeRole;
}

client.on('messageCreate', async(msg) => {
    try {
        if (!msg.guild) return;
        if (msg.author.bot) return;
        if (!msg.content.startsWith(PREFIX)) return;

        const member = await msg.guild.members.fetch(msg.author.id);
        if (!isAdminish(member)) {
            return msg.reply('このコマンドは管理者またはCommitteeロールのみ使用できます。');
        }

        // コマンドメッセージを削除（権限があれば）
        try {
            await msg.delete();
        } catch {}

        const [cmd, ...rest] = msg.content.slice(PREFIX.length).trim().split(/\s+/);
        const lower = cmd?.toLowerCase();

        // !add-role @role 27-times
        if (lower === 'add-role') {
            // 1番目: ロール指定（@メンション or ID）、2番目: カテゴリ名
            const roleMentionOrId = rest.shift();
            const category = rest.join(' ').trim();
            if (!roleMentionOrId || !category) {
                return msg.reply('使い方: `!add-role @ロール 27-times`');
            }
            const roleId = roleMentionOrId.replace(/[<@&>]/g, '');
            const role = msg.guild.roles.cache.get(roleId);
            if (!role) return msg.reply('そのロールが見つかりませんでした。');

            config.roleToCategory[roleId] = category;
            await saveConfig();
            return msg.reply(`マッピング追加: <@&${roleId}> → \`${category}\``);
        }

        // !remove-role @role
        if (lower === 'remove-role') {
            const roleMentionOrId = rest.shift();
            if (!roleMentionOrId) return msg.reply('使い方: `!remove-role @ロール`');
            const roleId = roleMentionOrId.replace(/[<@&>]/g, '');
            if (config.roleToCategory[roleId]) {
                delete config.roleToCategory[roleId];
                await saveConfig();
                return msg.reply(`マッピング削除: <@&${roleId}>`);
            }
            return msg.reply('そのロールのマッピングはありません。');
        }

        // !list-roles
        if (lower === 'list-roles') {
            const entries = Object.entries(config.roleToCategory);
            if (entries.length === 0) return msg.reply('マッピングは空です。');
            const lines = entries.map(([rid, cat]) => `• <@&${rid}> → \`${cat}\``);
            return msg.reply(`現在のマッピング:\n${lines.join('\n')}`);
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

        // !clear-trigger
        if (lower === 'clear-trigger') {
            config.trigger.messageId = '';
            config.trigger.channelId = '';
            await saveConfig();
            return msg.reply('トリガーをクリアしました。');
        }

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

        // !recreate-times @user1 @user2 ...
        if (lower === 'recreate-times') {
            const mentions = msg.mentions.users;

            if (mentions.size === 0) {
                return msg.reply('使い方: `!recreate-times @ユーザー1 @ユーザー2 ...`');
            }

            const results = [];
            for (const [userId, user] of mentions) {
                try {
                    const targetMember = await msg.guild.members.fetch(userId);
                    const categoryName = resolveCategoryNameFor(targetMember);

                    // 既存チャンネルを削除
                    const existing = findExistingTimesChannel(msg.guild, targetMember, categoryName);
                    if (existing) {
                        await existing.delete(`times再作成: ${targetMember.user.tag} (管理者コマンド)`);
                    }

                    // 新規作成
                    const channel = await createPersonalTimes(msg.guild, targetMember);
                    results.push(`🔄 ${user.tag} → ${channel} (再作成)`);
                } catch (error) {
                    console.error(`${user.tag}のtimes再作成エラー:`, error);
                    results.push(`❌ ${user.tag} の再作成に失敗`);
                }
            }
            return msg.reply(results.join('\n'));
        }

        // !status
        if (lower === 'status') {
            const lines = [
                `Default Category: \`${DEFAULT_CATEGORY_NAME}\``,
                `Private to member: \`${String(PRIVATE_TO_MEMBER)}\``,
                `Trigger: messageId=\`${config.trigger.messageId || '-'}\`, channelId=\`${config.trigger.channelId || '-'}\`, emoji=\`${config.trigger.emoji || '-'}\``,
                `Mappings: ${Object.keys(config.roleToCategory).length} 件（!list-roles で表示）`,
            ];
            return msg.reply(lines.join('\n'));
        }

        return msg.reply('未知のコマンドです。利用可能: `!add-role`, `!remove-role`, `!list-roles`, `!set-trigger`, `!clear-trigger`, `!make-times`, `!recreate-times`, `!status`');
    } catch (e) {
        console.error('コマンド処理エラー:', e);
    }
});

client.once('ready', async() => {
    await loadConfig();
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);