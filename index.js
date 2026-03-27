require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  AttachmentBuilder,
  MessageFlags 
} = require('discord.js');

const DB = require('./src/database');
const CMDS = require('./src/commands');
const { generateFamilyTree } = require('./src/treeCanvas');
const Love = require('./src/lovecalc'); // Importation du moteur Love

const TOKEN = process.env.DISCORD_TOKEN, CLIENT_ID = process.env.CLIENT_ID;
if (!TOKEN || !CLIENT_ID) { 
    console.error('DISCORD_TOKEN et CLIENT_ID requis'); 
    process.exit(1); 
}

const C = { rose: 0xFF6B9D, rouge: 0xFF3B5C, vert: 0x2DD4A0, bleu: 0x5B9CF6, or: 0xFFD166, violet: 0xA78BFA, gris: 0x8492A6 };
const PET_EMOJI = { chien: 'Chien', chat: 'Chat', poisson: 'Poisson', serpent: 'Serpent', oiseau: 'Oiseau' };

// Configuration des Embeds
function eb(color = C.violet) { 
    return new EmbedBuilder()
        .setColor(color)
        .setFooter({ text: 'Familly Bot — Dev by Sky' }) 
        .setTimestamp(); 
}
function ok(t, d) { return eb(C.vert).setTitle('OK — ' + t).setDescription(d); }
function err(t, d) { return eb(C.rouge).setTitle('Erreur — ' + t).setDescription(d); }
function inf(t, d, c = C.violet) { return eb(c).setTitle(t).setDescription(d); }

const PENDING = new Map();
function pk(type, from, to) { return `${type}:${from}:${to}`; }
function addP(type, from, to, gId, mId) { 
    const k = pk(type, from, to); 
    PENDING.set(k, { type, from, to, gId, mId, exp: Date.now() + 300000 }); 
    setTimeout(() => PENDING.delete(k), 300000); 
}
function getP(type, from, to) { const d = PENDING.get(pk(type, from, to)); return (d && d.exp > Date.now()) ? d : null; }
function delP(type, from, to) { PENDING.delete(pk(type, from, to)); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// Changement pour clientReady (v14/v15)
client.once('clientReady', async () => {
    console.log(`\nFamilly Bot en ligne : ${client.user.tag}\nDev by Sky\n`);
    client.user.setPresence({ status: 'online', activities: [{ name: '/aide | Familly Bot', type: 3 }] });
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: CMDS }); 
        console.log(`${CMDS.length} commandes slash enregistrees`); 
    } catch (e) { 
        console.error('Erreur commandes:', e.message); 
    }
});

client.on('interactionCreate', async i => {
    try {
        if (i.isChatInputCommand()) await slash(i);
        else if (i.isButton()) await button(i);
    } catch (e) {
        console.error(e);
        const p = { embeds: [err('Erreur', 'Une erreur est survenue.')], flags: [MessageFlags.Ephemeral] };
        if (i.replied || i.deferred) await i.followUp(p).catch(() => { });
        else await i.reply(p).catch(() => { });
    }
});

async function slash(i) {
    const { commandName: cmd, user, guild } = i;
    const gId = guild.id;

    // ── /lovecalc ──────────────────────────────────────────────────────────────
    if (cmd === 'lovecalc') {
        const users_raw = [
            i.options.getUser('personne1'),
            i.options.getUser('personne2'),
            i.options.getUser('personne3'),
            i.options.getUser('personne4'),
            i.options.getUser('personne5'),
        ].filter(Boolean);

        const seen = new Set(); 
        const users_list = users_raw.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
        if (users_list.length < 2) return i.reply({ embeds: [err('Erreur', 'Il faut au moins 2 personnes distinctes !')], flags: [MessageFlags.Ephemeral] });

        const ids = users_list.map(u => u.id);
        const { pairs, best, worst } = Love.calcMulti(ids);

        const scoreColor = Love.scoreColor(pairs.length === 1 ? pairs[0].score : best.score);
        const embed = new EmbedBuilder()
            .setColor(scoreColor)
            .setTitle('💘 Love Calculator')
            .setTimestamp()
            .setFooter({ text: 'Familly Bot — Les scores sont définitifs !' });

        if (pairs.length === 1) {
            const { id1, id2, score } = pairs[0];
            const u1 = users_list.find(u => u.id === id1), u2 = users_list.find(u => u.id === id2);
            const { emoji, msg } = Love.getMessage(score);
            const bar = Love.progressBar(score);
            embed
                .setDescription(`**${u1.username}** ${emoji} **${u2.username}**\n\n\`${bar}\` **${score}%**\n\n*${msg}*`)
                .setThumbnail(score >= 70 ? u1.displayAvatarURL({ dynamic: true }) : null);
        } else {
            const lines = pairs.map(({ id1, id2, score }) => {
                const n1 = users_list.find(u => u.id === id1)?.username || '???';
                const n2 = users_list.find(u => u.id === id2)?.username || '???';
                const bar = Love.progressBar(score);
                return `**${n1}** × **${n2}**\n\`${bar}\` **${score}%**`;
            });
            const bu1 = users_list.find(u => u.id === best.id1), bu2 = users_list.find(u => u.id === best.id2);
            const wu1 = users_list.find(u => u.id === worst.id1), wu2 = users_list.find(u => u.id === worst.id2);
            embed
                .setDescription(lines.join('\n\n'))
                .addFields(
                    { name: '💞 Meilleure paire', value: `**${bu1?.username || '???'}** & **${bu2?.username || '???'}** — ${best.score}%`, inline: true },
                    { name: '💔 Moins compatible', value: `**${wu1?.username || '???'}** & **${wu2?.username || '???'}** — ${worst.score}%`, inline: true },
                );
        }
        return i.reply({ embeds: [embed] });
    }

    // ── /love-admin ────────────────────────────────────────────────────────────
    if (cmd === 'love-admin') {
        const sub = i.options.getSubcommand();
        const u1 = i.options.getUser('personne1'), u2 = i.options.getUser('personne2');
        if (sub === 'boost') {
            const min = i.options.getInteger('score-min');
            const score = Love.boostPair(u1.id, u2.id, min);
            return i.reply({ embeds: [ok('Score booste !', `**${u1.username}** & **${u2.username}** ont maintenant un score de **${score}%** (minimum ${min}%)`)], flags: [MessageFlags.Ephemeral] });
        }
        if (sub === 'unboost') {
            const score = Love.removeBoosted(u1.id, u2.id);
            return i.reply({ embeds: [ok('Boost retire', `**${u1.username}** & **${u2.username}** ont maintenant un score libre de **${score}%**`)], flags: [MessageFlags.Ephemeral] });
        }
        if (sub === 'reset') {
            const fs = require('fs');
            const path = './data/love.json';
            const loveData = JSON.parse(fs.readFileSync(path, 'utf8'));
            const key = [u1.id, u2.id].sort().join(':');
            delete loveData[key];
            fs.writeFileSync(path, JSON.stringify(loveData, null, 2));
            Love.reloadConfig();
            return i.reply({ embeds: [ok('Score reinitialise', `Le score de **${u1.username}** & **${u2.username}** sera recalcule a la prochaine utilisation.`)], flags: [MessageFlags.Ephemeral] });
        }
    }

    if (cmd === 'aide') {
        return i.reply({
            flags: [MessageFlags.Ephemeral], 
            embeds: [eb(C.violet).setTitle('Familly Bot — Aide')
                .setDescription('Relations **inter-serveur** : votre famille vous suit partout !')
                .addFields(
                    { name: 'Mariage', value: '`/marier` `/divorcer` `/partenaire`' },
                    { name: 'Famille', value: '`/adopter` `/desadopter` `/abandon` `/enfants` `/parents`' },
                    { name: 'Animaux', value: '`/animal adopter` `/animal liste` `/animal abandonner`' },
                    { name: 'Genealogie', value: '`/arbre` `/famille` `/relation`' },
                    { name: 'Profil', value: '`/profil` `/bio` `/emoji` `/anniversaire` `/badges`' },
                    { name: 'Stats', value: '`/classement` `/statistiques` `/anniversaires`' },
                    { name: 'Admin', value: '`/config` `/admin`' },
                )]
        });
    }

    if (cmd === 'statistiques') {
        const gs = DB.getGlobalStats(); const ls = DB.getStats(gId);
        return i.reply({ embeds: [eb(C.bleu).setTitle('Statistiques')
            .setThumbnail(guild.iconURL({ dynamic: true }) || null)
            .addFields(
                { name: 'Serveur actuel', value: [`Mariages : **${ls.totalMariages}**`, `Divorces : **${ls.totalDivorces}**`, `Adoptions : **${ls.totalAdoptions}**`, `Animaux : **${ls.totalPets || 0}**`].join('\n'), inline: true },
                { name: 'Global', value: [`Utilisateurs : **${gs.totalUsers}**`, `Couples : **${gs.totalCouples}**`, `Divorces : **${gs.totalDivorces}**`, `Animaux : **${gs.totalPets}**`].join('\n'), inline: true },
            )] });
    }

    if (cmd === 'anniversaires') {
        const ids = DB.getAnniversairesToday();
        if (!ids.length) return i.reply({ embeds: [inf('Anniversaires', 'Aucun anniversaire aujourd\'hui !')] });
        return i.reply({ embeds: [inf('Anniversaires du jour !', ids.map(id => `<@${id}>`).join(', ') + ' !', C.or)] });
    }

    if (cmd === 'marier') {
        const cible = i.options.getUser('personne');
        if (cible.id === user.id) return i.reply({ embeds: [err('Impossible', 'Vous ne pouvez pas vous marier avec vous-meme !')], flags: [MessageFlags.Ephemeral] });
        if (cible.bot) return i.reply({ embeds: [err('Impossible', 'Impossible d\'epouser un bot !')], flags: [MessageFlags.Ephemeral] });
        if (DB.estMarie(user.id)) return i.reply({ embeds: [err('Deja marie', 'Divorcez d\'abord !')], flags: [MessageFlags.Ephemeral] });
        if (DB.estMarie(cible.id)) return i.reply({ embeds: [err('Impossible', `**${cible.username}** est deja marie(e) !`)], flags: [MessageFlags.Ephemeral] });
        if (DB.getRelation(user.id, cible.id)) return i.reply({ embeds: [err('Impossible', 'Impossible d\'epouser un membre de votre famille !')], flags: [MessageFlags.Ephemeral] });
        if (getP('mariage', user.id, cible.id)) return i.reply({ embeds: [err('Deja en attente', 'Demande deja envoyee !')], flags: [MessageFlags.Ephemeral] });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mariage_oui_${user.id}_${cible.id}`).setLabel('Accepter le mariage').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`mariage_non_${user.id}_${cible.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
        );
        const msg = await i.reply({ embeds: [eb(C.rose).setTitle('Demande en mariage !').setDescription(`${cible}, **${user.username}** vous demande en mariage !\n\nRepondez dans les 5 minutes.`).setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))], components: [row], fetchReply: true });
        addP('mariage', user.id, cible.id, gId, msg.id);
        return;
    }

    if (cmd === 'divorcer') {
        const pid = DB.getPartenaire(user.id);
        if (!pid) return i.reply({ embeds: [err('Pas marie', 'Vous n\'etes pas marie(e) !')], flags: [MessageFlags.Ephemeral] });
        const pu = await client.users.fetch(pid).catch(() => null);
        return i.reply({
            embeds: [inf('Confirmer le divorce', `Divorcer de **${pu?.username ?? '???'}** ? Action irreversible !`, C.rouge)],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`divorce_confirm_${user.id}`).setLabel('Confirmer le divorce').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`divorce_cancel_${user.id}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
            )],
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (cmd === 'partenaire') {
        const cible = i.options.getUser('personne') || user;
        const pid = DB.getPartenaire(cible.id);
        if (!pid) return i.reply({ embeds: [inf('Celibataire', `**${cible.username}** n\'est pas marie(e).`)] });
        const pu = await client.users.fetch(pid).catch(() => null);
        const data = DB.getUser(cible.id);
        const days = data.marriedAt ? Math.floor((Date.now() - new Date(data.marriedAt)) / 86400000) : 0;
        return i.reply({ embeds: [eb(C.rose).setTitle('Couple').setDescription(`**${cible.username}** est marie(e) avec **${pu?.username ?? '???'}** depuis **${days} jour${days > 1 ? 's' : ''}**`).setThumbnail(pu?.displayAvatarURL({ dynamic: true }) || null)] });
    }

    if (cmd === 'adopter') {
        const cible = i.options.getUser('personne');
        if (cible.id === user.id) return i.reply({ embeds: [err('Impossible', 'Vous ne pouvez pas vous adopter !')], flags: [MessageFlags.Ephemeral] });
        if (cible.bot) return i.reply({ embeds: [err('Impossible', 'Impossible d\'adopter un bot !')], flags: [MessageFlags.Ephemeral] });
        const pa = DB.getParents(cible.id);
        if (pa.includes(user.id)) return i.reply({ embeds: [err('Deja adopte', `**${cible.username}** est deja votre enfant !`)], flags: [MessageFlags.Ephemeral] });
        if (pa.length >= 2) return i.reply({ embeds: [err('Impossible', `**${cible.username}** a deja 2 parents !`)], flags: [MessageFlags.Ephemeral] });
        const arb = DB.getArbre(user.id);
        if (arb.parents.includes(cible.id) || arb.grandsParents.includes(cible.id)) return i.reply({ embeds: [err('Impossible', 'Impossible d\'adopter un de vos ascendants !')], flags: [MessageFlags.Ephemeral] });
        
        const pid = DB.getPartenaire(user.id);
        const pu = pid ? await client.users.fetch(pid).catch(() => null) : null;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`adoption_oui_${user.id}_${cible.id}`).setLabel('Accepter l\'adoption').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`adoption_non_${user.id}_${cible.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
        );
        const msg = await i.reply({ embeds: [eb(C.or).setTitle('Demande d\'adoption !').setDescription(`${cible}, **${user.username}** souhaite vous adopter !${pu ? `\nVous seriez aussi adopte(e) par **${pu.username}** !` : ''}\n\nRepondez dans les 5 minutes.`).setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))], components: [row], fetchReply: true });
        addP('adoption', user.id, cible.id, gId, msg.id); return;
    }

    if (cmd === 'desadopter') {
        const cible = i.options.getUser('personne');
        if (!DB.getEnfants(user.id).includes(cible.id)) return i.reply({ embeds: [err('Impossible', `**${cible.username}** n\'est pas votre enfant !`)], flags: [MessageFlags.Ephemeral] });
        DB.desadopter(user.id, cible.id);
        return i.reply({ embeds: [ok('Desadopte', `**${cible.username}** a quitte votre famille.`)] });
    }

    if (cmd === 'abandon') {
        if (!DB.getParents(user.id).length) return i.reply({ embeds: [err('Impossible', 'Vous n\'avez pas de parents !')], flags: [MessageFlags.Ephemeral] });
        DB.abandonFamille(user.id); return i.reply({ embeds: [ok('Famille quittee', 'Vous avez quitte votre famille.')] });
    }

    if (cmd === 'enfants') {
        const cible = i.options.getUser('personne') || user;
        const ids = DB.getEnfants(cible.id);
        if (!ids.length) return i.reply({ embeds: [inf(`Enfants de ${cible.username}`, 'Aucun enfant.')] });
        const lines = await Promise.all(ids.map(id => client.users.fetch(id).then(u => `<@${id}> — **${u.username}**`).catch(() => `<@${id}>`)));
        return i.reply({ embeds: [inf(`Enfants de ${cible.username} (${ids.length})`, lines.join('\n'), C.vert)] });
    }

    if (cmd === 'parents') {
        const cible = i.options.getUser('personne') || user;
        const ids = DB.getParents(cible.id);
        if (!ids.length) return i.reply({ embeds: [inf(`Parents de ${cible.username}`, 'Aucun parent.')] });
        const lines = await Promise.all(ids.map(id => client.users.fetch(id).then(u => `<@${id}> — **${u.username}**`).catch(() => `<@${id}>`)));
        return i.reply({ embeds: [inf(`Parents de ${cible.username}`, lines.join('\n'), C.bleu)] });
    }

    if (cmd === 'animal') {
        const sub = i.options.getSubcommand();
        if (sub === 'adopter') {
            const type = i.options.getString('type'), nom = i.options.getString('nom').slice(0, 32);
            if (DB.getPets(user.id).length >= 10) return i.reply({ embeds: [err('Limite', 'Vous avez deja 10 animaux !')], flags: [MessageFlags.Ephemeral] });
            const pet = DB.adopterAnimal(user.id, type, nom, gId);
            const partnerId = DB.getPartenaire(user.id);
            const partnerNote = partnerId ? `\n\nVotre conjoint(e) peut aussi l'adopter : \`/animal adopter-conjoint ${pet.id}\`` : '';
            return i.reply({ embeds: [ok('Animal adopte !', `**${nom}** le/la ${PET_EMOJI[type] || type} rejoint votre famille !\nID : \`${pet.id}\`${partnerNote}`)] });
        }
        if (sub === 'adopter-conjoint') {
            const petId = i.options.getString('id');
            const partnerId = DB.getPartenaire(user.id);
            if (!partnerId) return i.reply({ embeds: [err('Pas de conjoint', 'Vous devez etre marie(e) pour cette commande !')], flags: [MessageFlags.Ephemeral] });
            const partnerPets = DB.getPets(partnerId);
            const sourcePet = partnerPets.find(p => p.id === petId);
            if (!sourcePet) return i.reply({ embeds: [err('Introuvable', `Aucun animal avec l'ID \`${petId}\` appartenant a votre conjoint(e).`)], flags: [MessageFlags.Ephemeral] });
            const myPets = DB.getPets(user.id);
            if (myPets.some(p => p.id === petId)) return i.reply({ embeds: [err('Deja adopte', 'Vous avez deja adopte cet animal !')], flags: [MessageFlags.Ephemeral] });
            const newPet = DB.adopterAnimalConjoint(user.id, sourcePet, gId);
            return i.reply({ embeds: [ok('Animal adopte !', `**${sourcePet.name}** le/la ${PET_EMOJI[sourcePet.type] || sourcePet.type} est maintenant partage !`)] });
        }
        if (sub === 'liste') {
            const cible = i.options.getUser('personne') || user;
            const pets = DB.getPets(cible.id);
            if (!pets.length) return i.reply({ embeds: [inf(`Animaux de ${cible.username}`, 'Aucun animal.')] });
            const lines = pets.map(p => `${PET_EMOJI[p.type] || '?'} **${p.name}** — ID: \`${p.id}\``);
            return i.reply({ embeds: [inf(`Animaux de ${cible.username} (${pets.length})`, lines.join('\n'), C.violet)] });
        }
        if (sub === 'abandonner') {
            const petId = i.options.getString('id');
            if (!DB.abandonnerAnimal(user.id, petId)) return i.reply({ embeds: [err('Introuvable', `Aucun animal avec l'ID \`${petId}\`.`)], flags: [MessageFlags.Ephemeral] });
            return i.reply({ embeds: [ok('Animal abandonne', 'Votre animal a ete abandonne.')] });
        }
    }

    if (cmd === 'arbre') {
        const cible = i.options.getUser('personne') || user;
        await i.deferReply();
        try {
            const { buildFamilyGraph } = require('./src/familyGraph');
            const graph = buildFamilyGraph(cible.id);
            const allIds = [...graph.keys()];
            if (allIds.length <= 1) return i.editReply({ embeds: [inf('Arbre vide', `**${cible.username}** n\'a aucune famille.`)] });
            const userMap = {};
            await Promise.all(allIds.map(async uid => {
                try { const u = await client.users.fetch(uid); userMap[uid] = { username: u.displayName || u.username, avatarURL: u.displayAvatarURL({ extension: 'png', size: 64 }), pets: DB.getPets(uid) }; }
                catch { userMap[uid] = { username: 'Inconnu', avatarURL: null, pets: [] }; }
            }));
            const treeData = DB.getArbre(cible.id);
            const buf = await generateFamilyTree(treeData, userMap, cible.id);
            const att = new AttachmentBuilder(buf, { name: `arbre-${cible.id}.png` });
            return i.editReply({ embeds: [eb(C.violet).setTitle(`Arbre de ${cible.username}`).setImage(`attachment://arbre-${cible.id}.png`).setDescription('Relations globales Familly Bot.')], files: [att] });
        } catch (e) { console.error(e); return i.editReply({ embeds: [err('Erreur', 'Impossible de generer l\'arbre.')] }); }
    }

    if (cmd === 'famille') {
        const cible = i.options.getUser('personne') || user;
        await i.deferReply();
        const tree = DB.getArbre(cible.id);
        const fetch = async id => { try { const u = await client.users.fetch(id); return `<@${id}> — **${u.username}**`; } catch { return `<@${id}>`; } };
        const sections = [];
        if (tree.partner) { sections.push(`Conjoint(e)\n${await fetch(tree.partner)}`); }
        if (tree.parents.length) { sections.push(`Parents\n${(await Promise.all(tree.parents.map(fetch))).join('\n')}`); }
        if (tree.enfants.length) { sections.push(`Enfants\n${(await Promise.all(tree.enfants.map(fetch))).join('\n')}`); }
        const pets = DB.getPets(cible.id);
        if (pets.length) sections.push(`Animaux\n${pets.map(p => `**${p.name}** (${PET_EMOJI[p.type] || p.type})`).join(', ')}`);
        return i.editReply({ embeds: [eb(C.or).setTitle(`Famille de ${cible.username}`).setThumbnail(cible.displayAvatarURL({ dynamic: true })).setDescription(sections.length ? sections.join('\n\n') : 'Aucune famille.')] });
    }

    if (cmd === 'relation') {
        const cible = i.options.getUser('personne');
        if (cible.id === user.id) return i.reply({ embeds: [err('Impossible', 'C\'est vous-meme !')], flags: [MessageFlags.Ephemeral] });
        const rel = DB.getRelation(user.id, cible.id);
        return i.reply({ embeds: [inf('Lien de parente', rel ? `**${cible.username}** est votre ${rel}.` : `Aucun lien trouve.`, rel ? C.violet : C.gris)] });
    }

    if (cmd === 'profil') {
        const cible = i.options.getUser('personne') || user;
        await i.deferReply();
        const data = DB.getUser(cible.id); const arbre = DB.getArbre(cible.id);
        const pid = arbre.partner; const pu = pid ? await client.users.fetch(pid).catch(() => null) : null;
        const days = data.marriedAt ? Math.floor((Date.now() - new Date(data.marriedAt)) / 86400000) : 0;
        const pets = DB.getPets(cible.id);
        DB._checkBadges(cible.id);
        const BL = { premier_mariage: 'Premier Amour', famille_nombreuse: 'Grande Famille', divorces_3: 'Coeur Brise', serial_parent: 'Parent en serie', fidele: 'Fidele', ami_des_betes: 'Ami des betes' };
        const embed = eb(C.rose).setTitle(`Profil de ${cible.username}`).setThumbnail(cible.displayAvatarURL({ dynamic: true, size: 256 }))
            .setDescription((data.bio ? `"${data.bio}"\n\n` : '') + (pu ? `${data.emoji || '[Marie(e)]'} avec **${pu.username}** depuis **${days} jours**` : 'Celibataire'))
            .addFields(
                { name: 'Enfants', value: `**${arbre.enfants.length}**`, inline: true },
                { name: 'Parents', value: `**${arbre.parents.length}**`, inline: true },
                { name: 'Divorces', value: `**${data.divorces || 0}**`, inline: true },
                { name: 'Animaux', value: pets.length ? pets.map(p => `**${p.name}** (${PET_EMOJI[p.type] || p.type})`).join(', ') : 'Aucun', inline: false },
                { name: 'Badges', value: (data.badges || []).map(b => BL[b] || b).join(' | ') || 'Aucun', inline: false },
            );
        return i.editReply({ embeds: [embed] });
    }

    if (cmd === 'bio') { DB.updateBio(user.id, i.options.getString('texte')); return i.reply({ embeds: [ok('Bio mise a jour !', `"${i.options.getString('texte')}"`)], flags: [MessageFlags.Ephemeral] }); }
    if (cmd === 'emoji') { DB.updateEmoji(user.id, i.options.getString('emoji')); return i.reply({ embeds: [ok('Emoji mis a jour !', `Votre emoji : ${i.options.getString('emoji')}`)], flags: [MessageFlags.Ephemeral] }); }

    if (cmd === 'anniversaire') {
        const d = i.options.getString('date'), m = d.match(/^(\d{2})\/(\d{2})$/);
        if (!m || +m[2] > 12 || +m[1] > 31) return i.reply({ embeds: [err('Format invalide', 'Utilisez JJ/MM')], flags: [MessageFlags.Ephemeral] });
        DB.updateAnniversaire(user.id, `${m[2]}-${m[1]}`);
        return i.reply({ embeds: [ok('Anniversaire enregistre !', `Date : **${m[1]}/${m[2]}**`)], flags: [MessageFlags.Ephemeral] });
    }

    if (cmd === 'badges') {
        const cible = i.options.getUser('personne') || user;
        DB._checkBadges(cible.id); const data = DB.getUser(cible.id); const BADGES = DB.BADGES;
        const lines = (data.badges || []).map(b => BADGES[b] ? `**${BADGES[b].label}** — ${BADGES[b].desc}` : null).filter(Boolean);
        return i.reply({ embeds: [eb(C.or).setTitle(`Badges de ${cible.username}`).setDescription(lines.join('\n') || 'Aucun badge.')] });
    }
}

client.login(TOKEN);