/**
 * Base de données JSON globale — inter-serveur
 * users.json  = profils et familles (GLOBAL, pas par serveur)
 * guilds.json = config + stats par serveur
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const USERS_FILE  = path.join(DATA_DIR, 'users.json');
const GUILDS_FILE = path.join(DATA_DIR, 'guilds.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))  fs.writeFileSync(USERS_FILE,  '{}', 'utf8');
if (!fs.existsSync(GUILDS_FILE)) fs.writeFileSync(GUILDS_FILE, '{}', 'utf8');

let _users  = JSON.parse(fs.readFileSync(USERS_FILE,  'utf8'));
let _guilds = JSON.parse(fs.readFileSync(GUILDS_FILE, 'utf8'));

function saveUsers()  { fs.writeFileSync(USERS_FILE,  JSON.stringify(_users,  null, 2), 'utf8'); }
function saveGuilds() { fs.writeFileSync(GUILDS_FILE, JSON.stringify(_guilds, null, 2), 'utf8'); }

function _user(userId) {
  if (!_users[userId]) {
    _users[userId] = {
      partner: null, children: [], parents: [], pets: [],
      bio: '', emoji: '', marriedAt: null,
      divorces: 0, proposals: 0, adoptions: 0, badges: [], anniversaire: null,
    };
    saveUsers();
  }
  return _users[userId];
}

function _guild(guildId) {
  if (!_guilds[guildId]) {
    _guilds[guildId] = {
      stats: { totalMariages: 0, totalDivorces: 0, totalAdoptions: 0, totalPets: 0 },
      config: { logChannel: null, roleMaried: null },
    };
    saveGuilds();
  }
  return _guilds[guildId];
}

const DB = {
  estMarie(userId)      { return !!_user(userId).partner; },
  getPartenaire(userId) { return _user(userId).partner; },

  creerMariage(u1, u2, guildId) {
    const d = new Date().toISOString();
    const a = _user(u1); const b = _user(u2);
    a.partner = u2; a.marriedAt = d; a.proposals = (a.proposals||0)+1;
    b.partner = u1; b.marriedAt = d;
    _guild(guildId).stats.totalMariages++;
    DB._checkBadges(u1); DB._checkBadges(u2);
    saveUsers(); saveGuilds();
  },

  supprimerMariage(userId, guildId) {
    const u = _user(userId);
    const pid = u.partner;
    if (!pid) return null;
    const p = _user(pid);
    u.partner = null; u.marriedAt = null; u.divorces = (u.divorces||0)+1;
    p.partner = null; p.marriedAt = null; p.divorces = (p.divorces||0)+1;
    DB._checkBadges(userId); DB._checkBadges(pid);
    if (guildId) { _guild(guildId).stats.totalDivorces++; saveGuilds(); }
    saveUsers();
    return pid;
  },

  getEnfants(userId) { return _user(userId).children || []; },
  getParents(userId) { return _user(userId).parents  || []; },

  adopter(parentId, enfantId, guildId) {
    const parent = _user(parentId);
    const enfant = _user(enfantId);
    if (!parent.children.includes(enfantId)) { parent.children.push(enfantId); parent.adoptions=(parent.adoptions||0)+1; }
    if (!enfant.parents.includes(parentId))   enfant.parents.push(parentId);
    const pid = parent.partner;
    if (pid) {
      const pp = _user(pid);
      if (!pp.children.includes(enfantId)) { pp.children.push(enfantId); pp.adoptions=(pp.adoptions||0)+1; }
      if (!enfant.parents.includes(pid))   enfant.parents.push(pid);
    }
    if (guildId) { _guild(guildId).stats.totalAdoptions++; saveGuilds(); }
    DB._checkBadges(parentId);
    saveUsers();
  },

  desadopter(parentId, enfantId) {
    const parent = _user(parentId); const enfant = _user(enfantId);
    parent.children = parent.children.filter(c => c !== enfantId);
    enfant.parents  = enfant.parents.filter(p => p !== parentId);
    const pid = parent.partner;
    if (pid) { _user(pid).children = _user(pid).children.filter(c=>c!==enfantId); enfant.parents=enfant.parents.filter(p=>p!==pid); }
    saveUsers();
  },

  abandonFamille(userId) {
    const u = _user(userId);
    for (const pId of u.parents) _user(pId).children = _user(pId).children.filter(c=>c!==userId);
    u.parents = []; saveUsers();
  },

  // Animaux
  PETS_TYPES: {
    chien:   { label: 'Chien',   emoji: '🐕' },
    chat:    { label: 'Chat',    emoji: '🐈' },
    poisson: { label: 'Poisson', emoji: '🐟' },
    serpent: { label: 'Serpent', emoji: '🐍' },
    oiseau:  { label: 'Oiseau',  emoji: '🦜' },
  },

  getPets(userId) { return _user(userId).pets || []; },

  adopterAnimal(userId, type, name, guildId) {
    const u = _user(userId);
    if (!u.pets) u.pets = [];
    const pet = { id: randomUUID().slice(0,8), type, name, adoptedAt: new Date().toISOString() };
    u.pets.push(pet);
    DB._checkBadges(userId);
    if (guildId) { _guild(guildId).stats.totalPets = (_guild(guildId).stats.totalPets||0)+1; saveGuilds(); }
    saveUsers(); return pet;
  },

  adopterAnimalConjoint(userId, sourcePet, guildId) {
    // Adopte une copie de l'animal du conjoint (meme type/nom, nouvel ID)
    const u = _user(userId);
    if (!u.pets) u.pets = [];
    const pet = { id: randomUUID().slice(0,8), type: sourcePet.type, name: sourcePet.name, adoptedAt: new Date().toISOString(), sharedFrom: sourcePet.id };
    u.pets.push(pet);
    DB._checkBadges(userId);
    if (guildId) { _guild(guildId).stats.totalPets = (_guild(guildId).stats.totalPets||0)+1; saveGuilds(); }
    saveUsers(); return pet;
  },

  abandonnerAnimal(userId, petId) {
    const u = _user(userId);
    const before = (u.pets||[]).length;
    u.pets = (u.pets||[]).filter(p => p.id !== petId);
    saveUsers(); return u.pets.length < before;
  },

  getUser(userId)              { return _user(userId); },
  updateBio(userId, bio)       { _user(userId).bio = bio; saveUsers(); },
  updateEmoji(userId, emoji)   { _user(userId).emoji = emoji; saveUsers(); },
  updateAnniversaire(userId,d) { _user(userId).anniversaire = d; saveUsers(); },

  getConfig(guildId)           { return _guild(guildId).config; },
  setConfig(guildId, key, val) { _guild(guildId).config[key] = val; saveGuilds(); },
  getStats(guildId)            { return _guild(guildId).stats; },

  getArbre(userId) {
    const u = _user(userId);
    const pIds = u.parents||[]; const cIds = u.children||[];
    const grandsParents = []; const freresSoeurs = new Set();
    for (const pId of pIds) {
      const p = _user(pId);
      for (const gp of p.parents||[]) if (!grandsParents.includes(gp)) grandsParents.push(gp);
      for (const s  of p.children||[]) if (s!==userId) freresSoeurs.add(s);
    }
    const petitsEnfants = [];
    for (const cId of cIds) for (const gc of _user(cId).children||[]) if (!petitsEnfants.includes(gc)) petitsEnfants.push(gc);
    return { partner: u.partner, parents: pIds, enfants: cIds, grandsParents, freresSoeurs:[...freresSoeurs], petitsEnfants };
  },

  getRelation(u1, u2) {
    // Utilise le vrai BFS via familyGraph
    try {
      const { buildFamilyGraph } = require('./familyGraph');
      const graph = buildFamilyGraph(u1);
      const info = graph.get(u2);
      return info ? info.relation : null;
    } catch {
      return null;
    }
  },

  getLeaderboard(type) {
    const e = Object.entries(_users).map(([id,u])=>({id,...u}));
    switch(type) {
      case 'enfants':   return e.sort((a,b)=>(b.children?.length||0)-(a.children?.length||0)).slice(0,10);
      case 'divorces':  return e.sort((a,b)=>(b.divorces||0)-(a.divorces||0)).slice(0,10);
      case 'adoptions': return e.sort((a,b)=>(b.adoptions||0)-(a.adoptions||0)).slice(0,10);
      case 'animaux':   return e.sort((a,b)=>(b.pets?.length||0)-(a.pets?.length||0)).slice(0,10);
    }
    return e;
  },

  getAnniversairesToday() {
    const t = new Date();
    const s = `${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    return Object.entries(_users).filter(([,u])=>u.anniversaire===s).map(([id])=>id);
  },

  getCouplesCount() { return Object.values(_users).filter(u=>u.partner).length/2; },

  BADGES: {
    premier_mariage:   { label: 'Premier Amour',   desc: 'Marie pour la premiere fois' },
    famille_nombreuse: { label: 'Grande Famille',  desc: '5 enfants ou plus' },
    divorces_3:        { label: 'Coeur Brise',     desc: 'Divorce 3 fois' },
    serial_parent:     { label: 'Parent en serie', desc: '10 adoptions' },
    fidele:            { label: 'Fidele',          desc: 'Marie depuis 30+ jours' },
    ami_des_betes:     { label: 'Ami des betes',   desc: '3 animaux ou plus' },
  },

  _checkBadges(userId) {
    const u = _user(userId);
    const add = b => { if (!u.badges.includes(b)) u.badges.push(b); };
    if (u.partner)                     add('premier_mariage');
    if ((u.children?.length||0)>=5)    add('famille_nombreuse');
    if ((u.divorces||0)>=3)            add('divorces_3');
    if ((u.adoptions||0)>=10)          add('serial_parent');
    if ((u.pets?.length||0)>=3)        add('ami_des_betes');
    if (u.partner && u.marriedAt && (Date.now()-new Date(u.marriedAt))/86400000>=30) add('fidele');
    saveUsers();
  },

  resetUser(userId) {
    const u = _user(userId);
    if (u.partner) DB.supprimerMariage(userId, null);
    DB.abandonFamille(userId);
    for (const cId of [...(u.children||[])]) DB.desadopter(userId, cId);
    delete _users[userId]; saveUsers();
  },

  exportUser(userId) { return _user(userId); },

  getGlobalStats() {
    const u = Object.values(_users);
    return {
      totalUsers:    u.length,
      totalCouples:  Math.round(u.filter(x=>x.partner).length/2),
      totalAdoptions:u.reduce((s,x)=>s+(x.adoptions||0),0),
      totalDivorces: u.reduce((s,x)=>s+(x.divorces||0),0),
      totalPets:     u.reduce((s,x)=>s+(x.pets?.length||0),0),
    };
  },
};

module.exports = DB;
