require('dotenv').config();
const { Client,GatewayIntentBits,REST,Routes,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,AttachmentBuilder } = require('discord.js');
const DB   = require('./src/database');
const CMDS = require('./src/commands');
const { generateFamilyTree } = require('./src/treeCanvas');

const TOKEN=process.env.DISCORD_TOKEN, CLIENT_ID=process.env.CLIENT_ID;
if(!TOKEN||!CLIENT_ID){console.error('DISCORD_TOKEN et CLIENT_ID requis');process.exit(1);}

const C={rose:0xFF6B9D,rouge:0xFF3B5C,vert:0x2DD4A0,bleu:0x5B9CF6,or:0xFFD166,violet:0xA78BFA,gris:0x8492A6};
const PET_EMOJI={chien:'Chien',chat:'Chat',poisson:'Poisson',serpent:'Serpent',oiseau:'Oiseau'};

function eb(color=C.violet){return new EmbedBuilder().setColor(color).setFooter({text:'MarriageBot France'}).setTimestamp();}
function ok(t,d){return eb(C.vert).setTitle('OK — '+t).setDescription(d);}
function err(t,d){return eb(C.rouge).setTitle('Erreur — '+t).setDescription(d);}
function inf(t,d,c=C.violet){return eb(c).setTitle(t).setDescription(d);}

const PENDING=new Map();
function pk(type,from,to){return `${type}:${from}:${to}`;}
function addP(type,from,to,gId,mId){const k=pk(type,from,to);PENDING.set(k,{type,from,to,gId,mId,exp:Date.now()+300000});setTimeout(()=>PENDING.delete(k),300000);}
function getP(type,from,to){const d=PENDING.get(pk(type,from,to));return(d&&d.exp>Date.now())?d:null;}
function delP(type,from,to){PENDING.delete(pk(type,from,to));}

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});

client.once('ready',async()=>{
  console.log(`\nMarriageBot France en ligne : ${client.user.tag}\n`);
  client.user.setPresence({status:'online',activities:[{name:'/aide | MarriageBot France',type:3}]});
  const rest=new REST({version:'10'}).setToken(TOKEN);
  try{await rest.put(Routes.applicationCommands(CLIENT_ID),{body:CMDS});console.log(`${CMDS.length} commandes slash enregistrees`);}
  catch(e){console.error('Erreur commandes:',e.message);}
});

client.on('interactionCreate',async i=>{
  try{
    if(i.isChatInputCommand()) await slash(i);
    else if(i.isButton())      await button(i);
  }catch(e){
    console.error(e);
    const p={embeds:[err('Erreur','Une erreur est survenue.')],ephemeral:true};
    if(i.replied||i.deferred) await i.followUp(p).catch(()=>{});
    else await i.reply(p).catch(()=>{});
  }
});

async function slash(i){
  const{commandName:cmd,user,guild}=i;
  const gId=guild.id;

  // ── /lovecalc ──────────────────────────────────────────────────────────────
  if(cmd==='lovecalc'){
    const users_raw = [
      i.options.getUser('personne1'),
      i.options.getUser('personne2'),
      i.options.getUser('personne3'),
      i.options.getUser('personne4'),
      i.options.getUser('personne5'),
    ].filter(Boolean);

    // Dédupliquer
    const seen=new Set(); const users_list=users_raw.filter(u=>{if(seen.has(u.id))return false;seen.add(u.id);return true;});
    if(users_list.length<2) return i.reply({embeds:[err('Erreur','Il faut au moins 2 personnes distinctes !')],ephemeral:true});

    const ids = users_list.map(u=>u.id);
    const {pairs, best, worst} = Love.calcMulti(ids);

    // Embed principal
    const scoreColor = Love.scoreColor(pairs.length===1?pairs[0].score:best.score);
    const embed = new EmbedBuilder().setColor(scoreColor).setTitle('💘 Love Calculator').setTimestamp().setFooter({text:'MarriageBot France — Les scores sont definitifs !'});

    if (pairs.length===1) {
      // 2 personnes : affichage complet
      const {id1,id2,score} = pairs[0];
      const u1=users_list.find(u=>u.id===id1), u2=users_list.find(u=>u.id===id2);
      const {emoji,msg} = Love.getMessage(score);
      const bar = Love.progressBar(score);
      embed
        .setDescription(`**${u1.username}** ${emoji} **${u2.username}**

\`${bar}\` **${score}%**

*${msg}*`)
        .setThumbnail(score>=70?u1.displayAvatarURL({dynamic:true}):null);
    } else {
      // Multi : tableau de toutes les paires
      const bu1=users_list.find(u=>u.id===best.id1),bu2=users_list.find(u=>u.id===best.id2);
      const wu1=users_list.find(u=>u.id===worst.id1),wu2=users_list.find(u=>u.id===worst.id2);
      const lines = pairs.map(({id1,id2,score})=>{
        const n1=users_list.find(u=>u.id===id1)?.username||'???';
        const n2=users_list.find(u=>u.id===id2)?.username||'???';
        const bar=Love.progressBar(score);
        return `**${n1}** × **${n2}**\n\`${bar}\` **${score}%**`;
      });
      embed
        .setDescription(lines.join('\n\n'))
        .addFields(
          {name:'💞 Meilleure paire',value:`**${bu1?.username||'???'}** & **${bu2?.username||'???'}** — ${best.score}%`,inline:true},
          {name:'💔 Moins compatible',value:`**${wu1?.username||'???'}** & **${wu2?.username||'???'}** — ${worst.score}%`,inline:true},
        );
    }
    return i.reply({embeds:[embed]});
  }

  // ── /love-admin ────────────────────────────────────────────────────────────
  if(cmd==='love-admin'){
    const sub=i.options.getSubcommand();
    const u1=i.options.getUser('personne1'),u2=i.options.getUser('personne2');
    if(sub==='boost'){
      const min=i.options.getInteger('score-min');
      const score=Love.boostPair(u1.id,u2.id,min);
      return i.reply({embeds:[ok('Score booste !',`**${u1.username}** & **${u2.username}** ont maintenant un score de **${score}%** (minimum ${min}%)`)],ephemeral:true});
    }
    if(sub==='unboost'){
      const score=Love.removeBoosted(u1.id,u2.id);
      return i.reply({embeds:[ok('Boost retire',`**${u1.username}** & **${u2.username}** ont maintenant un score libre de **${score}%**`)],ephemeral:true});
    }
    if(sub==='reset'){
      const {pairKey} = require('./src/lovecalc');
      // Reset manuel
      Love.reloadConfig();
      const loveData = JSON.parse(require('fs').readFileSync('./data/love.json','utf8'));
      const key=[u1.id,u2.id].sort().join(':');
      delete loveData[key];
      require('fs').writeFileSync('./data/love.json',JSON.stringify(loveData,null,2));
      Love.reloadConfig();
      return i.reply({embeds:[ok('Score reinitialise',`Le score de **${u1.username}** & **${u2.username}** sera recalcule a la prochaine utilisation.`)],ephemeral:true});
    }
  }

  if(cmd==='aide'){
    return i.reply({ephemeral:true,embeds:[eb(C.violet).setTitle('MarriageBot France — Aide')
      .setDescription('Relations **inter-serveur** : votre famille vous suit partout !')
      .addFields(
        {name:'Mariage',value:'`/marier` `/divorcer` `/partenaire`'},
        {name:'Famille',value:'`/adopter` `/desadopter` `/abandon` `/enfants` `/parents`'},
        {name:'Animaux',value:'`/animal adopter` `/animal liste` `/animal abandonner`'},
        {name:'Genealogie',value:'`/arbre` `/famille` `/relation`'},
        {name:'Profil',value:'`/profil` `/bio` `/emoji` `/anniversaire` `/badges`'},
        {name:'Stats',value:'`/classement` `/statistiques` `/anniversaires`'},
        {name:'Admin',value:'`/config` `/admin`'},
      )]});
  }

  if(cmd==='statistiques'){
    const gs=DB.getGlobalStats();const ls=DB.getStats(gId);
    return i.reply({embeds:[eb(C.bleu).setTitle('Statistiques')
      .setThumbnail(guild.iconURL({dynamic:true})||null)
      .addFields(
        {name:'Serveur actuel',value:[`Mariages : **${ls.totalMariages}**`,`Divorces : **${ls.totalDivorces}**`,`Adoptions : **${ls.totalAdoptions}**`,`Animaux : **${ls.totalPets||0}**`].join('\n'),inline:true},
        {name:'Global',value:[`Utilisateurs : **${gs.totalUsers}**`,`Couples : **${gs.totalCouples}**`,`Divorces : **${gs.totalDivorces}**`,`Animaux : **${gs.totalPets}**`].join('\n'),inline:true},
      )]});
  }

  if(cmd==='anniversaires'){
    const ids=DB.getAnniversairesToday();
    if(!ids.length) return i.reply({embeds:[inf('Anniversaires','Aucun anniversaire aujourd\'hui !')]});
    return i.reply({embeds:[inf('Anniversaires du jour !',ids.map(id=>`<@${id}>`).join(', ')+' !',C.or)]});
  }

  if(cmd==='marier'){
    const cible=i.options.getUser('personne');
    if(cible.id===user.id) return i.reply({embeds:[err('Impossible','Vous ne pouvez pas vous marier avec vous-meme !')],ephemeral:true});
    if(cible.bot) return i.reply({embeds:[err('Impossible','Impossible d\'epouser un bot !')],ephemeral:true});
    if(DB.estMarie(user.id)) return i.reply({embeds:[err('Deja marie','Divorcez d\'abord !')],ephemeral:true});
    if(DB.estMarie(cible.id)) return i.reply({embeds:[err('Impossible',`**${cible.username}** est deja marie(e) !`)],ephemeral:true});
    if(DB.getRelation(user.id,cible.id)) return i.reply({embeds:[err('Impossible','Impossible d\'epouser un membre de votre famille !')],ephemeral:true});
    if(getP('mariage',user.id,cible.id)) return i.reply({embeds:[err('Deja en attente','Demande deja envoyee !')],ephemeral:true});
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mariage_oui_${user.id}_${cible.id}`).setLabel('Accepter le mariage').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mariage_non_${user.id}_${cible.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );
    const msg=await i.reply({embeds:[eb(C.rose).setTitle('Demande en mariage !').setDescription(`${cible}, **${user.username}** vous demande en mariage !\n\nRepondez dans les 5 minutes.`).setThumbnail(user.displayAvatarURL({dynamic:true,size:128}))],components:[row],fetchReply:true});
    addP('mariage',user.id,cible.id,gId,msg.id);
    return;
  }

  if(cmd==='divorcer'){
    const pid=DB.getPartenaire(user.id);
    if(!pid) return i.reply({embeds:[err('Pas marie','Vous n\'etes pas marie(e) !')],ephemeral:true});
    const pu=await client.users.fetch(pid).catch(()=>null);
    return i.reply({embeds:[inf('Confirmer le divorce',`Divorcer de **${pu?.username??'???'}** ? Action irreversible !`,C.rouge)],
      components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`divorce_confirm_${user.id}`).setLabel('Confirmer le divorce').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`divorce_cancel_${user.id}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      )],ephemeral:true});
  }

  if(cmd==='partenaire'){
    const cible=i.options.getUser('personne')||user;
    const pid=DB.getPartenaire(cible.id);
    if(!pid) return i.reply({embeds:[inf('Celibataire',`**${cible.username}** n\'est pas marie(e).`)]});
    const pu=await client.users.fetch(pid).catch(()=>null);
    const data=DB.getUser(cible.id);
    const days=data.marriedAt?Math.floor((Date.now()-new Date(data.marriedAt))/86400000):0;
    return i.reply({embeds:[eb(C.rose).setTitle('Couple').setDescription(`**${cible.username}** est marie(e) avec **${pu?.username??'???'}** depuis **${days} jour${days>1?'s':''}**`).setThumbnail(pu?.displayAvatarURL({dynamic:true})||null)]});
  }

  if(cmd==='adopter'){
    const cible=i.options.getUser('personne');
    if(cible.id===user.id) return i.reply({embeds:[err('Impossible','Vous ne pouvez pas vous adopter !')],ephemeral:true});
    if(cible.bot) return i.reply({embeds:[err('Impossible','Impossible d\'adopter un bot !')],ephemeral:true});
    const pa=DB.getParents(cible.id);
    if(pa.includes(user.id)) return i.reply({embeds:[err('Deja adopte',`**${cible.username}** est deja votre enfant !`)],ephemeral:true});
    if(pa.length>=2) return i.reply({embeds:[err('Impossible',`**${cible.username}** a deja 2 parents !`)],ephemeral:true});
    const arb=DB.getArbre(user.id);
    if(arb.parents.includes(cible.id)||arb.grandsParents.includes(cible.id)) return i.reply({embeds:[err('Impossible','Impossible d\'adopter un de vos ascendants !')],ephemeral:true});
    const pid=DB.getPartenaire(user.id);
    const pu=pid?await client.users.fetch(pid).catch(()=>null):null;
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`adoption_oui_${user.id}_${cible.id}`).setLabel('Accepter l\'adoption').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`adoption_non_${user.id}_${cible.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger),
    );
    const msg=await i.reply({embeds:[eb(C.or).setTitle('Demande d\'adoption !').setDescription(`${cible}, **${user.username}** souhaite vous adopter !${pu?`\nVous seriez aussi adopte(e) par **${pu.username}** !`:''}\n\nRepondez dans les 5 minutes.`).setThumbnail(user.displayAvatarURL({dynamic:true,size:128}))],components:[row],fetchReply:true});
    addP('adoption',user.id,cible.id,gId,msg.id);return;
  }

  if(cmd==='desadopter'){
    const cible=i.options.getUser('personne');
    if(!DB.getEnfants(user.id).includes(cible.id)) return i.reply({embeds:[err('Impossible',`**${cible.username}** n\'est pas votre enfant !`)],ephemeral:true});
    DB.desadopter(user.id,cible.id);
    return i.reply({embeds:[ok('Desadopte',`**${cible.username}** a quitte votre famille.`)]});
  }

  if(cmd==='abandon'){
    if(!DB.getParents(user.id).length) return i.reply({embeds:[err('Impossible','Vous n\'avez pas de parents !')],ephemeral:true});
    DB.abandonFamille(user.id);return i.reply({embeds:[ok('Famille quittee','Vous avez quitte votre famille.')]});
  }

  if(cmd==='enfants'){
    const cible=i.options.getUser('personne')||user;
    const ids=DB.getEnfants(cible.id);
    if(!ids.length) return i.reply({embeds:[inf(`Enfants de ${cible.username}`,'Aucun enfant.')]});
    const lines=await Promise.all(ids.map(id=>client.users.fetch(id).then(u=>`<@${id}> — **${u.username}**`).catch(()=>`<@${id}>`)));
    return i.reply({embeds:[inf(`Enfants de ${cible.username} (${ids.length})`,lines.join('\n'),C.vert)]});
  }

  if(cmd==='parents'){
    const cible=i.options.getUser('personne')||user;
    const ids=DB.getParents(cible.id);
    if(!ids.length) return i.reply({embeds:[inf(`Parents de ${cible.username}`,'Aucun parent.')]});
    const lines=await Promise.all(ids.map(id=>client.users.fetch(id).then(u=>`<@${id}> — **${u.username}**`).catch(()=>`<@${id}>`)));
    return i.reply({embeds:[inf(`Parents de ${cible.username}`,lines.join('\n'),C.bleu)]});
  }

  if(cmd==='animal'){
    const sub=i.options.getSubcommand();

    if(sub==='adopter'){
      const type=i.options.getString('type'),nom=i.options.getString('nom').slice(0,32);
      if(DB.getPets(user.id).length>=10) return i.reply({embeds:[err('Limite','Vous avez deja 10 animaux !')],ephemeral:true});
      const pet=DB.adopterAnimal(user.id,type,nom,gId);
      const partnerId=DB.getPartenaire(user.id);
      const partnerNote=partnerId?`\n\nVotre conjoint(e) peut aussi l'adopter : \`/animal adopter-conjoint ${pet.id}\``:'';
      return i.reply({embeds:[ok('Animal adopte !',`**${nom}** le/la ${PET_EMOJI[type]||type} rejoint votre famille !\nID : \`${pet.id}\`${partnerNote}`)]});
    }

    if(sub==='adopter-conjoint'){
      const petId=i.options.getString('id');
      const partnerId=DB.getPartenaire(user.id);
      if(!partnerId) return i.reply({embeds:[err('Pas de conjoint','Vous devez etre marie(e) pour cette commande !')],ephemeral:true});
      const partnerPets=DB.getPets(partnerId);
      const sourcePet=partnerPets.find(p=>p.id===petId);
      if(!sourcePet) return i.reply({embeds:[err('Introuvable',`Aucun animal avec l'ID \`${petId}\` appartenant a votre conjoint(e).\n\nUtilisez \`/animal liste @conjoint\` pour voir ses animaux.`)],ephemeral:true});
      const myPets=DB.getPets(user.id);
      if(myPets.some(p=>p.id===petId)) return i.reply({embeds:[err('Deja adopte','Vous avez deja adopte cet animal !')],ephemeral:true});
      if(myPets.length>=10) return i.reply({embeds:[err('Limite','Vous avez deja 10 animaux !')],ephemeral:true});
      const newPet=DB.adopterAnimalConjoint(user.id,sourcePet,gId);
      const pu=await client.users.fetch(partnerId).catch(()=>null);
      return i.reply({embeds:[ok('Animal adopte !',`**${sourcePet.name}** le/la ${PET_EMOJI[sourcePet.type]||sourcePet.type} de **${pu?.username??'votre conjoint(e)'}** fait maintenant partie de votre famille aussi !\nID : \`${newPet.id}\``)]});
    }

    if(sub==='liste'){
      const cible=i.options.getUser('personne')||user;
      const pets=DB.getPets(cible.id);
      if(!pets.length) return i.reply({embeds:[inf(`Animaux de ${cible.username}`,'Aucun animal.')]});
      const lines=pets.map(p=>`${PET_EMOJI[p.type]||'?'} **${p.name}** (${p.type}) — ID: \`${p.id}\``);
      return i.reply({embeds:[inf(`Animaux de ${cible.username} (${pets.length})`,lines.join('\n'),C.violet)]});
    }

    if(sub==='abandonner'){
      const petId=i.options.getString('id');
      if(!DB.abandonnerAnimal(user.id,petId)) return i.reply({embeds:[err('Introuvable',`Aucun animal avec l'ID \`${petId}\`.`)],ephemeral:true});
      return i.reply({embeds:[ok('Animal abandonne','Votre animal a ete abandonne.')]});
    }
  }

  if(cmd==='arbre'){
    const cible=i.options.getUser('personne')||user;
    await i.deferReply();
    try{
      // BFS complet : trouve TOUS les membres lies (oncles, cousins, arriere-GP...)
      const { buildFamilyGraph } = require('./src/familyGraph');
      const graph = buildFamilyGraph(cible.id);
      const allIds = [...graph.keys()];
      if(allIds.length<=1) return i.editReply({embeds:[inf('Arbre vide',`**${cible.username}** n\'a aucune famille. Utilisez \`/marier\` ou \`/adopter\` !`)]});
      const userMap={};
      await Promise.all(allIds.map(async uid=>{
        try{const u=await client.users.fetch(uid);userMap[uid]={username:u.displayName||u.username,avatarURL:u.displayAvatarURL({extension:'png',size:64}),pets:DB.getPets(uid)};}
        catch{userMap[uid]={username:'Inconnu',avatarURL:null,pets:[]};}
      }));
      const treeData=DB.getArbre(cible.id);
      const buf=await generateFamilyTree(treeData,userMap,cible.id);
      const att=new AttachmentBuilder(buf,{name:`arbre-${cible.id}.png`});
      const embed=eb(C.violet).setTitle(`Arbre de ${cible.username}`).setImage(`attachment://arbre-${cible.id}.png`).setDescription('Relations conservees sur tous les serveurs.');
      return i.editReply({embeds:[embed],files:[att]});
    }catch(e){console.error('Erreur arbre:',e);return i.editReply({embeds:[err('Erreur','Impossible de generer l\'arbre.')]});}
  }

  if(cmd==='famille'){
    const cible=i.options.getUser('personne')||user;
    await i.deferReply();
    const tree=DB.getArbre(cible.id);
    const fetch=async id=>{try{const u=await client.users.fetch(id);return `<@${id}> — **${u.username}**`;}catch{return `<@${id}>`;}};
    const sections=[];
    if(tree.partner){const data=DB.getUser(cible.id);sections.push(`Conjoint(e)\n${await fetch(tree.partner)}`);}
    if(tree.grandsParents.length) sections.push(`Grands-parents\n${(await Promise.all(tree.grandsParents.map(fetch))).join('\n')}`);
    if(tree.parents.length)       sections.push(`Parents\n${(await Promise.all(tree.parents.map(fetch))).join('\n')}`);
    if(tree.freresSoeurs.length)  sections.push(`Freres et soeurs\n${(await Promise.all(tree.freresSoeurs.map(fetch))).join('\n')}`);
    if(tree.enfants.length)       sections.push(`Enfants\n${(await Promise.all(tree.enfants.map(fetch))).join('\n')}`);
    if(tree.petitsEnfants.length) sections.push(`Petits-enfants\n${(await Promise.all(tree.petitsEnfants.map(fetch))).join('\n')}`);
    const pets=DB.getPets(cible.id);
    if(pets.length) sections.push(`Animaux\n${pets.map(p=>`**${p.name}** (${PET_EMOJI[p.type]||p.type})`).join(', ')}`);
    return i.editReply({embeds:[eb(C.or).setTitle(`Famille de ${cible.username}`).setThumbnail(cible.displayAvatarURL({dynamic:true})).setDescription(sections.length?sections.join('\n\n'):'Aucune famille.')]});
  }

  if(cmd==='relation'){
    const cible=i.options.getUser('personne');
    if(cible.id===user.id) return i.reply({embeds:[err('Impossible','C\'est vous-meme !')],ephemeral:true});
    const rel=DB.getRelation(user.id,cible.id);
    const labels={conjoint:`**${cible.username}** est votre conjoint(e)`,enfant:`**${cible.username}** est votre enfant`,parent:`**${cible.username}** est votre parent`,fratrie:`**${cible.username}** est votre frere/soeur`,grandParent:`**${cible.username}** est votre grand-parent`,petitEnfant:`**${cible.username}** est votre petit-enfant`,oncleTante:`**${cible.username}** est votre oncle/tante`};
    return i.reply({embeds:[inf('Lien de parente',rel?labels[rel]:`Aucun lien entre **${user.username}** et **${cible.username}**.`,rel?C.violet:C.gris)]});
  }

  if(cmd==='profil'){
    const cible=i.options.getUser('personne')||user;
    await i.deferReply();
    const data=DB.getUser(cible.id);const arbre=DB.getArbre(cible.id);
    const pid=arbre.partner;const pu=pid?await client.users.fetch(pid).catch(()=>null):null;
    const days=data.marriedAt?Math.floor((Date.now()-new Date(data.marriedAt))/86400000):0;
    const pets=DB.getPets(cible.id);
    DB._checkBadges(cible.id);
    const BL={premier_mariage:'Premier Amour',famille_nombreuse:'Grande Famille',divorces_3:'Coeur Brise',serial_parent:'Parent en serie',fidele:'Fidele',ami_des_betes:'Ami des betes'};
    const embed=eb(C.rose).setTitle(`Profil de ${cible.username}`).setThumbnail(cible.displayAvatarURL({dynamic:true,size:256}))
      .setDescription((data.bio?`"${data.bio}"\n\n`:'')+
        (pu?`${data.emoji||'[Marie(e)]'} avec **${pu.username}** depuis **${days} jour${days>1?'s':''}**`:'Celibataire'))
      .addFields(
        {name:'Enfants',value:`**${arbre.enfants.length}**`,inline:true},
        {name:'Parents',value:`**${arbre.parents.length}**`,inline:true},
        {name:'Divorces',value:`**${data.divorces||0}**`,inline:true},
        {name:'Animaux',value:pets.length?pets.map(p=>`**${p.name}** (${PET_EMOJI[p.type]||p.type})`).join(', '):'Aucun',inline:false},
        {name:'Badges',value:(data.badges||[]).map(b=>BL[b]||b).join(' | ')||'Aucun',inline:false},
      );
    if(data.anniversaire) embed.addFields({name:'Anniversaire',value:data.anniversaire.split('-').reverse().join('/'),inline:true});
    return i.editReply({embeds:[embed]});
  }

  if(cmd==='bio'){DB.updateBio(user.id,i.options.getString('texte'));return i.reply({embeds:[ok('Bio mise a jour !',`"${i.options.getString('texte')}"`)],ephemeral:true});}
  if(cmd==='emoji'){DB.updateEmoji(user.id,i.options.getString('emoji'));return i.reply({embeds:[ok('Emoji mis a jour !',`Votre emoji : ${i.options.getString('emoji')}`)],ephemeral:true});}

  if(cmd==='anniversaire'){
    const d=i.options.getString('date'),m=d.match(/^(\d{2})\/(\d{2})$/);
    if(!m||+m[2]>12||+m[1]>31) return i.reply({embeds:[err('Format invalide','Utilisez JJ/MM ex: 14/02')],ephemeral:true});
    DB.updateAnniversaire(user.id,`${m[2]}-${m[1]}`);
    return i.reply({embeds:[ok('Anniversaire enregistre !',`Date : **${m[1]}/${m[2]}**`)],ephemeral:true});
  }

  if(cmd==='badges'){
    const cible=i.options.getUser('personne')||user;
    DB._checkBadges(cible.id);const data=DB.getUser(cible.id);const BADGES=DB.BADGES;
    const lines=(data.badges||[]).map(b=>BADGES[b]?`**${BADGES[b].label}** — ${BADGES[b].desc}`:null).filter(Boolean);
    const non=Object.entries(BADGES).filter(([k])=>!data.badges?.includes(k)).map(([,v])=>v.label);
    const embed=eb(C.or).setTitle(`Badges de ${cible.username}`).setThumbnail(cible.displayAvatarURL({dynamic:true})).setDescription(lines.length?lines.join('\n'):'Aucun badge pour le moment.');
    if(non.length) embed.addFields({name:'Non debloques',value:non.join(' | ')});
    return i.reply({embeds:[embed]});
  }

  if(cmd==='classement'){
    const type=i.options.getString('type');await i.deferReply();
    const entries=DB.getLeaderboard(type);
    const medals=['1.','2.','3.'];
    const labels={enfants:'Enfants',divorces:'Divorces',adoptions:'Adoptions',animaux:'Animaux'};
    const lines=await Promise.all(entries.slice(0,10).map(async(e,i2)=>{
      const u=await client.users.fetch(e.id).catch(()=>null);
      const nm=u?u.username:'Inconnu';
      const val=type==='enfants'?(e.children?.length||0):type==='divorces'?(e.divorces||0):type==='animaux'?(e.pets?.length||0):(e.adoptions||0);
      return`${medals[i2]||`${i2+1}.`} **${nm}** — ${val}`;
    }));
    const filtered=lines.filter((_,idx)=>{const e=entries[idx];const v=type==='enfants'?(e.children?.length||0):type==='divorces'?(e.divorces||0):type==='animaux'?(e.pets?.length||0):(e.adoptions||0);return v>0;});
    return i.editReply({embeds:[eb(C.or).setTitle(`Classement — ${labels[type]}`).setDescription(filtered.length?filtered.join('\n'):'Aucune donnee.')]});
  }

  if(cmd==='config'){
    const sub=i.options.getSubcommand();
    if(sub==='log'){const s=i.options.getChannel('salon');DB.setConfig(gId,'logChannel',s.id);return i.reply({embeds:[ok('Logs configures',`Logs dans <#${s.id}>`)],ephemeral:true});}
    if(sub==='role-marie'){const r=i.options.getRole('role');DB.setConfig(gId,'roleMaried',r.id);return i.reply({embeds:[ok('Role configure',`<@&${r.id}> attribue au mariage`)],ephemeral:true});}
    if(sub==='voir'){const cfg=DB.getConfig(gId);return i.reply({embeds:[eb(C.bleu).setTitle('Configuration').addFields({name:'Logs',value:cfg.logChannel?`<#${cfg.logChannel}>`:'Non configure',inline:true},{name:'Role marie',value:cfg.roleMaried?`<@&${cfg.roleMaried}>`:'Non configure',inline:true})],ephemeral:true});}
  }

  if(cmd==='admin'){
    const sub=i.options.getSubcommand();
    if(sub==='reset'){const c=i.options.getUser('personne');DB.resetUser(c.id);return i.reply({embeds:[ok('Reset effectue',`Profil de **${c.username}** reinitialise.`)],ephemeral:true});}
    if(sub==='infos'){const c=i.options.getUser('personne');const d=DB.exportUser(c.id);return i.reply({embeds:[eb(C.gris).setTitle(`Donnees de ${c.username}`).setDescription(`\`\`\`json\n${JSON.stringify(d,null,2).slice(0,3800)}\n\`\`\``)],ephemeral:true});}
  }
}

async function button(i){
  const{customId,user,guild}=i;const parts=customId.split('_');const gId=guild.id;

  if(customId.startsWith('mariage_oui_')){
    const[,,fromId,toId]=parts;
    if(user.id!==toId) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    const d=getP('mariage',fromId,toId);
    if(!d) return i.reply({embeds:[err('Expiree','Cette demande a expire !')],ephemeral:true});
    delP('mariage',fromId,toId);DB.creerMariage(fromId,toId,gId);
    const fu=await client.users.fetch(fromId).catch(()=>null);
    await _role(guild,gId,fromId,toId,true);
    await _log(guild,gId,eb(C.rose).setTitle('Nouveau mariage !').setDescription(`**${fu?.username??'???'}** et **${user.username}** se sont maries !`));
    return i.update({embeds:[eb(C.rose).setTitle('Felicitations !').setDescription(`**${fu?.username??'???'}** et **${user.username}** sont maintenant maries !`)],components:[]});
  }
  if(customId.startsWith('mariage_non_')){
    const[,,fromId,toId]=parts;
    if(user.id!==toId) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    delP('mariage',fromId,toId);const fu=await client.users.fetch(fromId).catch(()=>null);
    return i.update({embeds:[eb(C.gris).setTitle('Demande refusee').setDescription(`**${user.username}** a refuse la demande de **${fu?.username??'???'}**.`)],components:[]});
  }
  if(customId.startsWith('divorce_confirm_')){
    const userId=parts[2];
    if(user.id!==userId) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    const pid=DB.supprimerMariage(userId,gId);const pu=pid?await client.users.fetch(pid).catch(()=>null):null;
    await _role(guild,gId,userId,pid,false);
    await _log(guild,gId,eb(C.rouge).setTitle('Divorce').setDescription(`**${user.username}** et **${pu?.username??'???'}** ont divorce.`));
    return i.update({embeds:[eb(C.rouge).setTitle('Divorce prononce').setDescription(`**${user.username}** et **${pu?.username??'???'}** ont divorce.`)],components:[]});
  }
  if(customId.startsWith('divorce_cancel_')){
    if(user.id!==parts[2]) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    return i.update({embeds:[inf('Divorce annule','Procedure annulee. L\'amour continue !')],components:[]});
  }
  if(customId.startsWith('adoption_oui_')){
    const[,,fromId,toId]=parts;
    if(user.id!==toId) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    const d=getP('adoption',fromId,toId);
    if(!d) return i.reply({embeds:[err('Expiree','Cette demande a expire !')],ephemeral:true});
    delP('adoption',fromId,toId);DB.adopter(fromId,toId,gId);
    const fu=await client.users.fetch(fromId).catch(()=>null);
    const pid=DB.getPartenaire(fromId);const pu=pid?await client.users.fetch(pid).catch(()=>null):null;
    await _log(guild,gId,eb(C.or).setTitle('Adoption !').setDescription(`**${user.username}** a ete adopte(e) par **${fu?.username??'???'}**${pu?` et **${pu.username}**`:''}!`));
    return i.update({embeds:[eb(C.or).setTitle('Adoption reussie !').setDescription(`**${user.username}** a ete adopte(e) par **${fu?.username??'???'}**${pu?` et **${pu.username}**`:''}!`)],components:[]});
  }
  if(customId.startsWith('adoption_non_')){
    const[,,fromId,toId]=parts;
    if(user.id!==toId) return i.reply({embeds:[err('Interdit','Ce bouton ne vous est pas destine !')],ephemeral:true});
    delP('adoption',fromId,toId);const fu=await client.users.fetch(fromId).catch(()=>null);
    return i.update({embeds:[eb(C.gris).setTitle('Adoption refusee').setDescription(`**${user.username}** a refuse la demande de **${fu?.username??'???'}**.`)],components:[]});
  }
}

async function _log(guild,gId,embed){try{const cfg=DB.getConfig(gId);if(!cfg.logChannel)return;const ch=await guild.channels.fetch(cfg.logChannel).catch(()=>null);if(ch)await ch.send({embeds:[embed]});}catch{}}
async function _role(guild,gId,u1,u2,add){
  try{const cfg=DB.getConfig(gId);if(!cfg.roleMaried)return;const r=await guild.roles.fetch(cfg.roleMaried).catch(()=>null);if(!r)return;
  for(const uid of[u1,u2].filter(Boolean)){const m=await guild.members.fetch(uid).catch(()=>null);if(m)await(add?m.roles.add(r):m.roles.remove(r)).catch(()=>{});}}catch{}
}

setInterval(async()=>{
  const ids=DB.getAnniversairesToday();if(!ids.length)return;
  for(const[gId,guild]of client.guilds.cache){try{const cfg=DB.getConfig(gId);if(!cfg.logChannel)continue;const ch=await guild.channels.fetch(cfg.logChannel).catch(()=>null);if(!ch)continue;await ch.send({embeds:[eb(C.or).setTitle('Anniversaires du jour !').setDescription(ids.map(id=>`<@${id}>`).join(', '))]});}catch{}}
},3600000);

client.login(TOKEN);
