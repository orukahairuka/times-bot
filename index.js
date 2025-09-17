// 日本語コメント多め：櫻井さん向け最小実装
import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    ChannelType,
    Partials,
} from 'discord.js';

/** ====== 設定（必要に応じて書き換え） ====== */

// 個人timesをまとめるカテゴリ名
const CATEGORY_NAME = 'times';

// 生成される個人チャンネル名の接頭辞
const CHANNEL_PREFIX = 'times-';

// リアクションで作成したい場合のトリガー設定
// どちらか片方だけでもOK（メッセージ指定の方が誤爆しにくい）
const TRIGGER_MESSAGE_ID = '1417863744230395975'; // 例: '1284567890123456789'（空なら無視）
const TRIGGER_CHANNEL_ID = ''; // 例: '123456789012345678'（空なら無視）
const TRIGGER_EMOJI = '✅'; // 例: '✅', '🧵' など

// （任意）このロールを持ってる人だけ作成を許可したい場合はIDを入れる。空なら無制限。
// const REQUIRED_ROLE_ID = '';

// （任意）チャンネルを本人だけに見せたい場合 true（全員に見せたいなら false）
const PRIVATE_TO_MEMBER = true;

/** =========================================== */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // 参加/退出イベント
        GatewayIntentBits.GuildMessages, // メッセージ取得（リアクション用）
        GatewayIntentBits.GuildMessageReactions, // リアクションイベント
    ],
    // 未キャッシュのMessage/Reaction/Userでも発火できるようにpartialsを有効化
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

const EVERYONE = (guild) => guild.roles.everyone.id;

/** チャンネル名に使えない文字を置換して安全化 */
function sanitizeForChannelName(name) {
    const ascii = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w-]+/g, '-') // 英数・アンダースコア・ハイフン以外→ハイフン
        .replace(/_+/g, '-') // アンダースコア連続→ハイフン
        .replace(/-+/g, '-') // ハイフン連続→1つ
        .replace(/^-|-$/g, ''); // 先頭/末尾のハイフン除去
    return ascii || 'user';
}

/** 既存の個人timesを検索（多重作成防止） */
function findExistingTimesChannel(guild, member) {
    const base = sanitizeForChannelName(member.user.username);
    const expected = `${CHANNEL_PREFIX}${base}`;
    return guild.channels.cache.find(
        (c) =>
        c.type === ChannelType.GuildText &&
        c.name === expected &&
        c.parent?.name === CATEGORY_NAME
    );
}

/** timesカテゴリを取得 or 作成 */
async function ensureCategory(guild) {
    let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME
    );
    if (!category) {
        category = await guild.channels.create({
            name: CATEGORY_NAME,
            type: ChannelType.GuildCategory,
            reason: 'timesカテゴリの自動作成',
        });
    }
    return category;
}

/** 個人timesを作成（存在すればそれを返す） */
async function createPersonalTimes(guild, member) {
    const category = await ensureCategory(guild);

    // 既存チェック
    const existing = findExistingTimesChannel(guild, member);
    if (existing) return existing;

    const base = sanitizeForChannelName(member.user.username);
    const name = `${CHANNEL_PREFIX}${base}`.slice(0, 90); // 念のため90字制限
    const everyoneId = EVERYONE(guild);

    // 権限（本人だけ見える or 全員見える）
    const permissionOverwrites = PRIVATE_TO_MEMBER ? [{
                id: everyoneId,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
        ] :
        undefined;

    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites,
        reason: `times作成: ${member.user.tag}`,
    });

    await channel.send(
        `ようこそ <@${member.id}> さん！ここがあなたの **times** です。\n` +
        `日報・メモ・進捗など自由にどうぞ。`
    );

    return channel;
}

/** 参加時：自動で個人timesを作成 */
client.on('guildMemberAdd', async(member) => {
    try {
        // （任意ロール制限）必要ならここで弾く
        // if (REQUIRED_ROLE_ID && !member.roles.cache.has(REQUIRED_ROLE_ID)) return;
        await createPersonalTimes(member.guild, member);
    } catch (e) {
        console.error('参加時times作成失敗:', e);
    }
});

/** 退出時：個人timesを削除（上限対策） */
client.on('guildMemberRemove', async(member) => {
    try {
        const guild = member.guild;
        if (!guild) return;
        const ch = findExistingTimesChannel(guild, member);
        if (ch) {
            await ch.delete(`退出に伴うtimes削除: ${member.user?.tag ?? member.id}`);
        }
    } catch (e) {
        console.error('退出時times削除失敗:', e);
    }
});

/** リアクションで個人times作成（指定メッセージ/チャンネル＋指定絵文字） */
client.on('messageReactionAdd', async(reaction, user) => {
    try {
        if (user.bot) return;

        // 未キャッシュ対策
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const { message } = reaction;
        const guild = message.guild;
        if (!guild) return;

        // 絵文字一致
        if (reaction.emoji.name !== TRIGGER_EMOJI) return;

        // メッセージ/チャンネル判定（指定されている方だけチェック）
        if (TRIGGER_MESSAGE_ID && message.id !== TRIGGER_MESSAGE_ID) return;
        if (TRIGGER_CHANNEL_ID && message.channel.id !== TRIGGER_CHANNEL_ID) return;

        const member = await guild.members.fetch(user.id);

        // （任意ロール制限）必要ならここで弾く
        // if (REQUIRED_ROLE_ID && !member.roles.cache.has(REQUIRED_ROLE_ID)) return;

        const channel = await createPersonalTimes(guild, member);

        // 成功通知（#channel へのリンク表記になる）
        await message.channel.send(
            `<@${user.id}> あなたの times を作成しました → ${channel}`
        );

        // 反応を外して誤爆/連打を防ぐ（権限が無ければ無視）
        try {
            await reaction.users.remove(user.id);
        } catch {}
    } catch (e) {
        console.error('リアクション発火エラー:', e);
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);