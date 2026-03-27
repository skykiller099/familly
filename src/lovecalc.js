/**
 * lovecalc.js — Moteur de compatibilité amoureuse
 *
 * Fonctionnement :
 *  1. Score persistant : une fois calculé pour 2 users, il ne change JAMAIS
 *     (stocké dans data/love.json)
 *  2. Config : data/love-config.json définit des paires forcées à 80%+
 *     Format : { "boosted": [["userId1","userId2", score], ...] }
 *  3. Algorithme : hash déterministe des 2 IDs → score 1-100
 *     avec bruit aléatoire fixé par seed (reproductible)
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const LOVE_FILE   = path.join(__dirname,'..','data','love.json');
const CONFIG_FILE = path.join(__dirname,'..','data','love-config.json');
const DATA_DIR    = path.join(__dirname,'..','data');

// ─── Init fichiers ────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
if (!fs.existsSync(LOVE_FILE))   fs.writeFileSync(LOVE_FILE,  '{}', 'utf8');
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({
  boosted: [],
  comment: "Format: { boosted: [['userId1','userId2', score_min], ...] } — score_min entre 80 et 99"
}, null, 2), 'utf8');

let _love   = JSON.parse(fs.readFileSync(LOVE_FILE,   'utf8'));
let _config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

function saveAll() {
  fs.writeFileSync(LOVE_FILE, JSON.stringify(_love, null, 2), 'utf8');
}

// ─── Clé canonique pour une paire ────────────────────────────────────────────
function pairKey(id1, id2) {
  return [id1, id2].sort().join(':');
}

// ─── Vérifier si une paire est boostée ───────────────────────────────────────
function getBoostedScore(id1, id2) {
  const boosted = _config.boosted || [];
  for (const entry of boosted) {
    const [a, b, minScore] = entry;
    if (([a,b].sort().join(':') === [id1,id2].sort().join(':'))) {
      return Math.max(80, Math.min(99, minScore || 85));
    }
  }
  return null;
}

// ─── Hash déterministe → score 1-100 ─────────────────────────────────────────
function deterministicScore(id1, id2) {
  const key = pairKey(id1, id2);
  const hash = createHash('sha256').update('lovebot-v1:' + key).digest('hex');
  // On utilise les 8 premiers octets comme seed
  const n = parseInt(hash.slice(0,8), 16);
  // Distribution légèrement biaisée vers le centre (30-90)
  const raw = (n % 100) + 1; // 1-100 uniforme
  // On applique une courbe douce pour avoir moins d'extrêmes
  // et une distribution plus naturelle
  const curved = Math.round(10 + (raw/100)*80 + Math.sin(n)*5);
  return Math.max(1, Math.min(100, curved));
}

// ─── Obtenir ou créer le score pour une paire ────────────────────────────────
function getScore(id1, id2) {
  const key = pairKey(id1, id2);
  if (_love[key] !== undefined) return _love[key];

  // Vérifier si boosté
  const boosted = getBoostedScore(id1, id2);
  let score;
  if (boosted !== null) {
    // Score aléatoire entre boosted et 99
    const hash = createHash('sha256').update('love-boost:'+key).digest('hex');
    const rand = parseInt(hash.slice(0,4), 16) % (99 - boosted + 1);
    score = boosted + rand;
  } else {
    score = deterministicScore(id1, id2);
  }

  _love[key] = score;
  saveAll();
  return score;
}

// ─── Recharger la config ──────────────────────────────────────────────────────
function reloadConfig() {
  try {
    _config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
}

// ─── Message selon le score ───────────────────────────────────────────────────
function getMessage(score) {
  if (score >= 95) return { emoji:'💞', msg:'Une connexion cosmique ! Votre amour defie les lois de l\'univers.' };
  if (score >= 85) return { emoji:'💖', msg:'Une compatibilite exceptionnelle. Les etoiles sont alignees pour vous !' };
  if (score >= 75) return { emoji:'💕', msg:'Tres bonne compatibilite ! Vous etes faits l\'un pour l\'autre.' };
  if (score >= 60) return { emoji:'💓', msg:'Bonne entente. Avec un peu d\'effort, ca peut etre magnifique !' };
  if (score >= 45) return { emoji:'💛', msg:'Compatibilite moyenne. La vie est une aventure ensemble !' };
  if (score >= 30) return { emoji:'🤍', msg:'Ca sera complique... mais l\'amour surmonte tout !' };
  if (score >= 15) return { emoji:'💔', msg:'L\'amour est aveugle, dit-on. Tres aveugle dans ce cas.' };
  return { emoji:'😬', msg:'L\'univers a dit non. Tres categoriquement non.' };
}

// ─── Barre de progression ─────────────────────────────────────────────────────
function progressBar(score) {
  const filled = Math.round(score/5);
  const empty  = 20 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ─── Couleur selon score ──────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 85) return 0xFF69B4; // rose
  if (score >= 65) return 0xF97316; // orange
  if (score >= 45) return 0xFBBF24; // jaune
  if (score >= 25) return 0x60A5FA; // bleu
  return 0x94A3B8; // gris
}

// ─── Calcul multi-users ───────────────────────────────────────────────────────
/**
 * @param {string[]} userIds - liste d'IDs (2 à 5)
 * @returns {{ pairs: [{id1,id2,score}], best, worst }}
 */
function calcMulti(userIds) {
  const pairs = [];
  for (let i=0; i<userIds.length; i++) {
    for (let j=i+1; j<userIds.length; j++) {
      const score = getScore(userIds[i], userIds[j]);
      pairs.push({ id1:userIds[i], id2:userIds[j], score });
    }
  }
  pairs.sort((a,b)=>b.score-a.score);
  return {
    pairs,
    best:  pairs[0],
    worst: pairs[pairs.length-1],
  };
}

// ─── Admin : forcer une paire ─────────────────────────────────────────────────
function boostPair(id1, id2, minScore) {
  reloadConfig();
  const key = [id1,id2].sort().join(':');
  if (!_config.boosted) _config.boosted = [];
  // Retirer si déjà présent
  _config.boosted = _config.boosted.filter(e => [e[0],e[1]].sort().join(':') !== key);
  _config.boosted.push([id1, id2, Math.max(80,Math.min(99,minScore))]);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(_config, null, 2), 'utf8');
  // Effacer le score caché pour le recalculer
  delete _love[pairKey(id1,id2)];
  saveAll();
  // Recalcule immédiatement
  return getScore(id1, id2);
}

function removeBoosted(id1, id2) {
  reloadConfig();
  const key = [id1,id2].sort().join(':');
  _config.boosted = (_config.boosted||[]).filter(e => [e[0],e[1]].sort().join(':') !== key);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(_config, null, 2), 'utf8');
  // Recalcule librement
  delete _love[pairKey(id1,id2)];
  saveAll();
  return getScore(id1,id2);
}

module.exports = { getScore, calcMulti, getMessage, progressBar, scoreColor, boostPair, removeBoosted, reloadConfig };
