const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  rose:    0xFF6B9D,
  rouge:   0xFF3B5C,
  vert:    0x2DD4A0,
  bleu:    0x5B9CF6,
  or:      0xFFD166,
  violet:  0xA78BFA,
  gris:    0x8492A6,
  orange:  0xFF9F43,
  creme:   0xFFF1E6,
  dark:    0x1A1A2E,
  cyan:    0x06D6A0,
  corail:  0xFF6B6B,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Embed de base — bande de couleur rose, footer discret
 */
function base(couleur = C.rose) {
  return new EmbedBuilder()
    .setColor(couleur)
    .setFooter({ text: 'Familly Bot by Sky', iconURL: 'https://i.imgur.com/HeIi0wU.png' })
    .setTimestamp();
}

function succes(titre, description, fields = []) {
  const e = base(C.vert)
    .setTitle(`<:check:✅> ${titre}`)
    .setDescription(description);
  if (fields.length) e.addFields(fields);
  return e;
}

function erreur(titre, description) {
  return base(C.rouge).setTitle(`❌ ${titre}`).setDescription(description);
}

function info(titre, description, couleur = C.violet) {
  return base(couleur).setTitle(titre).setDescription(description);
}

// ─── Embed Demande (mariage / adoption) ──────────────────────────────────────
function demande(opts) {
  // opts: { type, fromUser, toMention, partnerInfo? }
  const isMarriage = opts.type === 'mariage';
  const emoji = isMarriage ? '💍' : '🍼';
  const couleur = isMarriage ? C.rose : C.or;

  const embed = base(couleur)
    .setTitle(`${emoji} Demande de ${isMarriage ? 'mariage' : 'd\'adoption'} !`)
    .setDescription(
      isMarriage
        ? `${opts.toMention} ✨\n\n` +
          `**${opts.fromUser.username}** vous demande en mariage avec tout son amour 💕\n` +
          `\nRépondez dans les **5 minutes** !`
        : `${opts.toMention} 👋\n\n` +
          `**${opts.fromUser.username}** souhaite vous accueillir dans sa famille ! 🏠` +
          (opts.partnerInfo ? `\n\n👫 Vous seriez également adopté(e) par **${opts.partnerInfo}** !` : '') +
          `\n\nRépondez dans les **5 minutes** !`
    )
    .setThumbnail(opts.fromUser.displayAvatarURL({ dynamic: true, size: 128 }));

  return embed;
}

// ─── Boutons Accept/Refuse ────────────────────────────────────────────────────
function boutonsDemande(type, fromId, toId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${type}_oui_${fromId}_${toId}`)
      .setLabel(type === 'mariage' ? '💍 Accepter' : '👶 Accepter')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${type}_non_${fromId}_${toId}`)
      .setLabel('💔 Refuser')
      .setStyle(ButtonStyle.Danger),
  );
}

function boutonsConfirm(id, label, customIdPrefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_confirm_${id}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_cancel_${id}`)
      .setLabel('↩️ Annuler')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Embed Profil ─────────────────────────────────────────────────────────────
async function profil(guildId, targetUser, DB, client) {
  const data = DB.getUser(guildId, targetUser.id);
  const arbre = DB.getArbre(guildId, targetUser.id);
  const BADGES = DB.BADGES;

  let statutLine = '💔 **Célibataire**';
  if (data.partner) {
    const partnerUser = await client.users.fetch(data.partner).catch(() => null);
    const days = data.marriedAt ? Math.floor((Date.now() - new Date(data.marriedAt)) / 86400000) : 0;
    statutLine = `${data.emoji} **Marié(e) avec ${partnerUser?.username ?? '???'}** depuis ${days} jour${days > 1 ? 's' : ''}`;
  }

  const badgesStr = (data.badges || []).map(b => BADGES[b] ? `${BADGES[b].emoji}` : '').join(' ') || '*(aucun badge)*';
  const anniversaire = data.anniversaire ? `🎂 ${data.anniversaire.replace('-', '/')}` : '';

  const embed = base(C.rose)
    .setTitle(`👤 ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription((data.bio ? `*"${data.bio}"*\n\n` : '') + statutLine)
    .addFields(
      { name: '👶 Enfants', value: `**${arbre.enfants.length}**`, inline: true },
      { name: '👨‍👩 Parents', value: `**${arbre.parents.length}**`, inline: true },
      { name: '💔 Divorces', value: `**${data.divorces || 0}**`, inline: true },
      { name: '🏅 Badges', value: badgesStr, inline: false },
    );

  if (anniversaire) embed.addFields({ name: 'Anniversaire', value: anniversaire, inline: true });

  return embed;
}

// ─── Embed Arbre généalogique ─────────────────────────────────────────────────
async function arbre(guildId, targetUser, DB, client) {
  const tree = DB.getArbre(guildId, targetUser.id);

  const fetch = async (id) => {
    const u = await client.users.fetch(id).catch(() => null);
    return u ? `**${u.username}**` : '`Inconnu`';
  };

  const partnerName = tree.partner ? await fetch(tree.partner) : null;
  const parentsNames = await Promise.all(tree.parents.map(fetch));
  const enfantsNames = await Promise.all(tree.enfants.map(fetch));
  const gpNames      = await Promise.all(tree.grandsParents.map(fetch));
  const sibNames     = await Promise.all(tree.freresSoeurs.map(fetch));
  const peNames      = await Promise.all(tree.petitsEnfants.map(fetch));

  const ligne = (emoji, label, arr) =>
    arr.length ? { name: `${emoji} ${label}`, value: arr.join(', '), inline: false } : null;

  const fields = [
    ligne('👴👵', 'Grands-parents', gpNames),
    ligne('🧑‍🤝‍🧑', 'Parents', parentsNames),
    ligne('👫', 'Frères & Sœurs', sibNames),
    {
      name: '⭐ Vous',
      value: `**${targetUser.username}**${partnerName ? `  ${DB.getUser(guildId, targetUser.id).emoji}  ${partnerName}` : '  💔 Célibataire'}`,
      inline: false
    },
    ligne('👶', 'Enfants', enfantsNames),
    ligne('🧒', 'Petits-enfants', peNames),
  ].filter(Boolean);

  return base(C.vert)
    .setTitle(`🌳 Arbre généalogique de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(fields);
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
async function leaderboard(guildId, type, DB, client) {
  const entries = DB.getLeaderboard(guildId, type);
  const labels = { enfants: '👶 Enfants', divorces: '💔 Divorces', adoptions: '🍼 Adoptions' };
  const medals = ['🥇', '🥈', '🥉'];

  const lines = await Promise.all(entries.slice(0, 10).map(async (e, i) => {
    const u = await client.users.fetch(e.id).catch(() => null);
    const name = u ? u.username : 'Inconnu';
    const val = type === 'enfants' ? (e.children?.length || 0)
              : type === 'divorces' ? (e.divorces || 0)
              : (e.adoptions || 0);
    const medal = medals[i] || `**${i + 1}.**`;
    return `${medal} **${name}** — ${val}`;
  }));

  const filtered = lines.filter((_, i) => {
    const e = entries[i];
    const val = type === 'enfants' ? (e.children?.length || 0)
              : type === 'divorces' ? (e.divorces || 0)
              : (e.adoptions || 0);
    return val > 0;
  });

  return base(C.or)
    .setTitle(`🏆 Classement — ${labels[type]}`)
    .setDescription(filtered.length ? filtered.join('\n') : '*Aucune donnée pour ce classement.*');
}

// ─── Embed Stats ──────────────────────────────────────────────────────────────
function stats(guildId, DB, guild) {
  const s = DB.getStats(guildId);
  const couples = DB.getCouplesCount(guildId);
  const userCount = Object.keys(DB.getGuild(guildId).users).length;

  return base(C.bleu)
    .setTitle(`📊 Statistiques — ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true }) || null)
    .addFields(
      { name: '💍 Couples actuels', value: `**${Math.round(couples)}**`, inline: true },
      { name: '💒 Mariages (total)', value: `**${s.totalMariages}**`, inline: true },
      { name: '💔 Divorces (total)', value: `**${s.totalDivorces}**`, inline: true },
      { name: '👶 Adoptions (total)', value: `**${s.totalAdoptions}**`, inline: true },
      { name: '👥 Utilisateurs enregistrés', value: `**${userCount}**`, inline: true },
    );
}

// ─── Embed Aide ───────────────────────────────────────────────────────────────
function aide() {
  return base(C.violet)
    .setTitle('💒 MarriageBot France — Guide complet')
    .setDescription('Créez votre famille virtuelle sur Discord ! Toutes les commandes sont des **slash commands** (commence par `/`).')
    .addFields(
      {
        name: '💍 Relations amoureuses',
        value: [
          '`/marier @personne` — Demande en mariage',
          '`/divorcer` — Divorcer de votre conjoint(e)',
          '`/partenaire` — Voir votre conjoint(e)',
        ].join('\n'),
      },
      {
        name: '👨‍👩‍👧‍👦 Famille',
        value: [
          '`/adopter @personne` — Adopter quelqu\'un *(partagé avec le conjoint !)*',
          '`/desadopter @personne` — Désadopter un enfant',
          '`/abandon` — Quitter votre famille',
          '`/enfants [@personne]` — Liste des enfants',
          '`/parents [@personne]` — Voir les parents',
        ].join('\n'),
      },
      {
        name: '🌳 Généalogie',
        value: [
          '`/arbre [@personne]` — Arbre généalogique complet',
          '`/famille [@personne]` — Famille étendue',
          '`/relation @personne` — Votre lien de parenté',
        ].join('\n'),
      },
      {
        name: '👤 Profil',
        value: [
          '`/profil [@personne]` — Profil famille',
          '`/bio <texte>` — Modifier votre bio',
          '`/emoji <emoji>` — Emoji de relation',
          '`/anniversaire <JJ/MM>` — Enregistrer votre date de naissance',
          '`/badges [@personne]` — Voir vos badges',
        ].join('\n'),
      },
      {
        name: '🏆 Classements & Stats',
        value: [
          '`/classement <type>` — Top enfants / divorces / adoptions',
          '`/statistiques` — Stats du serveur',
          '`/anniversaires` — Anniversaires du jour',
        ].join('\n'),
      },
      {
        name: '🛠️ Administration',
        value: [
          '`/config log <salon>` — Salon de logs',
          '`/config role-marie <rôle>` — Rôle auto au mariage',
          '`/admin reset @personne` — Réinitialiser un profil',
          '`/admin infos @personne` — Données brutes d\'un utilisateur',
        ].join('\n'),
      },
    );
}

module.exports = { C, base, succes, erreur, info, demande, boutonsDemande, boutonsConfirm, profil, arbre, leaderboard, stats, aide };
