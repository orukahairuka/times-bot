// 管理者コマンド対応版：動的にロール設定可能
import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    ChannelType,
    Partials,
    EmbedBuilder,
} from 'discord.js';
import fs from 'fs';
import path from 'path';

/** ====== 基本設定 ====== */
const CHANNEL_PREFIX = 'times-';
const PRIVATE_TO_MEMBER = true;
const DEFAULT_CATEGORY_NAME = 'times';
const CONFIG_FILE = 'config.json';

// 設定管理用チャンネル名
const ADMIN_CHANNEL_NAME = 'bot-config';

/** ==================== */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // メッセージ内容取得
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// 設定を保存/読み込み
let config = {
    roleMappings: {}, // { guildId: { roleId: categoryName } }
    triggerMessages: {}, // { guildId: { messageId, channelId, emoji } }
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            config = JSON.parse(data);
        }
    } catch (e) {
        console.error('設定読み込みエラー:', e);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('設定保存エラー:', e);
    }
}

const EVERYONE = (guild) => guild.roles.everyone.id;

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

/** メンバーのロールからカテゴリ名を決定 */
function resolveCategoryNameFor(guild, member) {
    const guildConfig = config.roleMappings[guild.id] || {};

    // 設定されたロールマッピングをチェック
    for (const role of member.roles.cache.values()) {
        if (guildConfig[role.id]) {
            return guildConfig[role.id];
        }
    }

    // 自動検出：ロール名から数字を判定
    const yearPattern = /(\d{2,4})[卒年]/;
    for (const role of member.roles.cache.values()) {
        const match = role.name.match(yearPattern);
        if (match) {
            let year = match[1];
            if (year.length === 2) {
                // 2桁の場合、現在の年から判断
                const currentYear = new Date().getFullYear();
                const currentShort = currentYear % 100;
                const inputYear = parseInt(year);

                // 例：現在2024年、入力が25なら2025年、入力が99なら1999年
                if (inputYear <= currentShort + 10) {
                    year = `20${year}`;
                } else {
                    year = `19${year}`;
                }
            }
            const shortYear = year.slice(-2);
            return `${shortYear}-times`;
        }
    }

    return DEFAULT_CATEGORY_NAME;
}

/** 既存の個人timesを検索 */
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

/** カテゴリを取得 or 作成 */
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

/** 管理用チャンネルを取得 or 作成 */
async function ensureAdminChannel(guild) {
    let channel = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name === ADMIN_CHANNEL_NAME
    );

    if (!channel) {
        const everyoneId = EVERYONE(guild);

        // 管理者ロールを探す
        const adminRoles = guild.roles.cache.filter(role =>
            role.permissions.has(PermissionsBitField.Flags.Administrator)
        );

        const permissionOverwrites = [
            {
                id: everyoneId,
                deny: [PermissionsBitField.Flags.ViewChannel],
            }
        ];

        // 管理者ロールに権限を付与
        for (const role of adminRoles.values()) {
            permissionOverwrites.push({
                id: role.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                ],
            });
        }

        channel = await guild.channels.create({
            name: ADMIN_CHANNEL_NAME,
            type: ChannelType.GuildText,
            permissionOverwrites,
            reason: 'BOT設定用チャンネル作成',
        });

        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📋 BOT設定コマンド')
            .setDescription('このチャンネルでBOTを設定できます')
            .addFields(
                { name: '!add-role @ロール カテゴリ名', value: 'ロールとカテゴリをマッピング\n例: `!add-role @27卒 27-times`', inline: false },
                { name: '!remove-role @ロール', value: 'ロールのマッピングを削除', inline: false },
                { name: '!list-roles', value: '現在の設定を表示', inline: false },
                { name: '!set-trigger メッセージID 絵文字', value: 'リアクショントリガーを設定\n例: `!set-trigger 1234567890 ✅`', inline: false },
                { name: '!clear-trigger', value: 'リアクショントリガーを削除', inline: false },
                { name: '!status', value: 'BOTの状態を確認', inline: false }
            )
            .setFooter({ text: '管理者のみ使用可能' });

        await channel.send({ embeds: [helpEmbed] });
    }

    return channel;
}

/** 個人timesを作成 */
async function createPersonalTimes(guild, member) {
    const categoryName = resolveCategoryNameFor(guild, member);
    const category = await ensureCategory(guild, categoryName);

    const existing = findExistingTimesChannel(guild, member, categoryName);
    if (existing) return existing;

    const base = sanitizeForChannelName(member.user.username);
    const name = `${CHANNEL_PREFIX}${base}`.slice(0, 90);
    const everyoneId = EVERYONE(guild);

    const permissionOverwrites = PRIVATE_TO_MEMBER
        ? [
            { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
        ]
        : undefined;

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

/** 管理者コマンド処理 */
async function handleAdminCommand(message) {
    const { guild, member, content, channel } = message;

    // 管理者権限チェック
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply('❌ このコマンドは管理者のみ使用可能です。');
    }

    // bot-configチャンネル以外では無視
    if (channel.name !== ADMIN_CHANNEL_NAME) return;

    const args = content.slice(1).split(/\s+/);
    const command = args[0]?.toLowerCase();

    if (!config.roleMappings[guild.id]) {
        config.roleMappings[guild.id] = {};
    }

    switch (command) {
        case 'add-role': {
            const roleMatch = args[1]?.match(/<@&(\d+)>/);
            const categoryName = args.slice(2).join(' ');

            if (!roleMatch || !categoryName) {
                return message.reply('❌ 使用方法: `!add-role @ロール カテゴリ名`');
            }

            const roleId = roleMatch[1];
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                return message.reply('❌ ロールが見つかりません。');
            }

            config.roleMappings[guild.id][roleId] = categoryName;
            saveConfig();

            return message.reply(`✅ ロール「${role.name}」を「${categoryName}」カテゴリにマッピングしました。`);
        }

        case 'remove-role': {
            const roleMatch = args[1]?.match(/<@&(\d+)>/);

            if (!roleMatch) {
                return message.reply('❌ 使用方法: `!remove-role @ロール`');
            }

            const roleId = roleMatch[1];
            const role = guild.roles.cache.get(roleId);

            if (config.roleMappings[guild.id][roleId]) {
                delete config.roleMappings[guild.id][roleId];
                saveConfig();
                return message.reply(`✅ ロール「${role?.name || roleId}」のマッピングを削除しました。`);
            }

            return message.reply('❌ このロールはマッピングされていません。');
        }

        case 'list-roles': {
            const mappings = config.roleMappings[guild.id] || {};

            if (Object.keys(mappings).length === 0) {
                return message.reply('📋 現在、ロールマッピングは設定されていません。');
            }

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('📋 ロールマッピング設定')
                .setDescription('現在の設定:');

            for (const [roleId, categoryName] of Object.entries(mappings)) {
                const role = guild.roles.cache.get(roleId);
                embed.addFields({
                    name: role?.name || `不明なロール (${roleId})`,
                    value: `→ ${categoryName}`,
                    inline: true
                });
            }

            return message.reply({ embeds: [embed] });
        }

        case 'set-trigger': {
            const messageId = args[1];
            const emoji = args[2];

            if (!messageId || !emoji) {
                return message.reply('❌ 使用方法: `!set-trigger メッセージID 絵文字`');
            }

            if (!config.triggerMessages[guild.id]) {
                config.triggerMessages[guild.id] = {};
            }

            config.triggerMessages[guild.id] = {
                messageId,
                channelId: channel.id,
                emoji
            };

            saveConfig();
            return message.reply(`✅ リアクショントリガーを設定しました: メッセージID ${messageId}, 絵文字 ${emoji}`);
        }

        case 'clear-trigger': {
            delete config.triggerMessages[guild.id];
            saveConfig();
            return message.reply('✅ リアクショントリガーを削除しました。');
        }

        case 'status': {
            const mappingCount = Object.keys(config.roleMappings[guild.id] || {}).length;
            const trigger = config.triggerMessages[guild.id];

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('🤖 BOTステータス')
                .addFields(
                    { name: 'ロールマッピング数', value: `${mappingCount}個`, inline: true },
                    { name: 'リアクショントリガー', value: trigger ? `設定済み (${trigger.emoji})` : '未設定', inline: true },
                    { name: 'デフォルトカテゴリ', value: DEFAULT_CATEGORY_NAME, inline: true }
                );

            return message.reply({ embeds: [embed] });
        }

        default:
            return message.reply('❓ 不明なコマンドです。ヘルプを確認してください。');
    }
}

// イベントハンドラー
client.on('guildMemberAdd', async (member) => {
    try {
        await createPersonalTimes(member.guild, member);
    } catch (e) {
        console.error('参加時times作成失敗:', e);
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        const guild = member.guild;
        if (!guild) return;

        const allCategories = new Set();
        allCategories.add(DEFAULT_CATEGORY_NAME);

        // 設定されたカテゴリを追加
        const guildMappings = config.roleMappings[guild.id] || {};
        for (const cat of Object.values(guildMappings)) {
            allCategories.add(cat);
        }

        // 自動検出されるカテゴリも考慮
        for (let year = 20; year <= 35; year++) {
            allCategories.add(`${year}-times`);
        }

        for (const cat of allCategories) {
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

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const { message } = reaction;
        const guild = message.guild;
        if (!guild) return;

        const trigger = config.triggerMessages[guild.id];
        if (!trigger) return;

        if (reaction.emoji.name !== trigger.emoji) return;
        if (message.id !== trigger.messageId) return;

        const member = await guild.members.fetch(user.id);
        const channel = await createPersonalTimes(guild, member);
        await message.channel.send(
            `<@${user.id}> あなたの times を作成しました → ${channel}`
        );

        try {
            await reaction.users.remove(user.id);
        } catch {}
    } catch (e) {
        console.error('リアクション発火エラー:', e);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith('!')) return;

    await handleAdminCommand(message);
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // 各サーバーで管理チャンネルを作成
    for (const guild of client.guilds.cache.values()) {
        try {
            await ensureAdminChannel(guild);
        } catch (e) {
            console.error(`管理チャンネル作成失敗 (${guild.name}):`, e);
        }
    }
});

// 設定読み込み & BOT起動
loadConfig();
client.login(process.env.DISCORD_TOKEN);