const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = [
  // Relations
  new SlashCommandBuilder().setName('marier').setDescription('Demander quelqun en mariage').addUserOption(o=>o.setName('personne').setDescription('La personne a epouser').setRequired(true)),
  new SlashCommandBuilder().setName('divorcer').setDescription('Divorcer de votre conjoint'),
  new SlashCommandBuilder().setName('partenaire').setDescription('Voir votre conjoint').addUserOption(o=>o.setName('personne').setDescription('Quelqun dautre (optionnel)')),
  // Famille
  new SlashCommandBuilder().setName('adopter').setDescription('Adopter quelqun').addUserOption(o=>o.setName('personne').setDescription('La personne a adopter').setRequired(true)),
  new SlashCommandBuilder().setName('desadopter').setDescription('Desadopter un enfant').addUserOption(o=>o.setName('personne').setDescription('Lenfant').setRequired(true)),
  new SlashCommandBuilder().setName('abandon').setDescription('Quitter votre famille'),
  new SlashCommandBuilder().setName('enfants').setDescription('Voir les enfants').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  new SlashCommandBuilder().setName('parents').setDescription('Voir les parents').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  // Animaux
  new SlashCommandBuilder().setName('animal').setDescription('Gerer vos animaux de compagnie')
    .addSubcommand(s=>s.setName('adopter').setDescription('Adopter un animal').addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Chien',value:'chien'},{name:'Chat',value:'chat'},{name:'Poisson',value:'poisson'},{name:'Serpent',value:'serpent'},{name:'Oiseau',value:'oiseau'})).addStringOption(o=>o.setName('nom').setDescription('Prenom de lanimal').setRequired(true)))
    .addSubcommand(s=>s.setName('liste').setDescription('Voir vos animaux').addUserOption(o=>o.setName('personne').setDescription('Quelqun dautre')))
    .addSubcommand(s=>s.setName('abandonner').setDescription('Abandonner un animal').addStringOption(o=>o.setName('id').setDescription('ID de lanimal (dans /animal liste)').setRequired(true))),
  // Genealogie
  new SlashCommandBuilder().setName('arbre').setDescription('Arbre genealogique visuel').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  new SlashCommandBuilder().setName('famille').setDescription('Famille etendue').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  new SlashCommandBuilder().setName('relation').setDescription('Lien de parente').addUserOption(o=>o.setName('personne').setDescription('La personne').setRequired(true)),
  // Profil
  new SlashCommandBuilder().setName('profil').setDescription('Voir un profil famille').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  new SlashCommandBuilder().setName('bio').setDescription('Modifier votre bio').addStringOption(o=>o.setName('texte').setDescription('Votre bio').setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder().setName('emoji').setDescription('Changer votre emoji de relation').addStringOption(o=>o.setName('emoji').setDescription('Votre emoji').setRequired(true)),
  new SlashCommandBuilder().setName('anniversaire').setDescription('Enregistrer votre anniversaire').addStringOption(o=>o.setName('date').setDescription('Format JJ/MM ex: 14/02').setRequired(true)),
  new SlashCommandBuilder().setName('badges').setDescription('Voir vos badges').addUserOption(o=>o.setName('personne').setDescription('La personne')),
  // Stats
  new SlashCommandBuilder().setName('classement').setDescription('Classement').addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Enfants',value:'enfants'},{name:'Divorces',value:'divorces'},{name:'Adoptions',value:'adoptions'},{name:'Animaux',value:'animaux'})),
  new SlashCommandBuilder().setName('statistiques').setDescription('Stats du serveur'),
  new SlashCommandBuilder().setName('anniversaires').setDescription('Anniversaires du jour'),
  // Config
  new SlashCommandBuilder().setName('config').setDescription('Configuration').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('log').setDescription('Salon de logs').addChannelOption(o=>o.setName('salon').setDescription('Salon').setRequired(true)))
    .addSubcommand(s=>s.setName('role-marie').setDescription('Role au mariage').addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s=>s.setName('voir').setDescription('Voir la config')),
  // Admin
  new SlashCommandBuilder().setName('admin').setDescription('Administration').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('reset').setDescription('Reset un profil').addUserOption(o=>o.setName('personne').setDescription('La personne').setRequired(true)))
    .addSubcommand(s=>s.setName('infos').setDescription('Donnees brutes').addUserOption(o=>o.setName('personne').setDescription('La personne').setRequired(true))),
  new SlashCommandBuilder().setName('aide').setDescription('Guide du bot'),
].map(c=>c.toJSON());
