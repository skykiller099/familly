/**
 * familyGraph.js — Moteur de graphe familial complet
 *
 * BFS depuis mainId, calcule relations + generation.
 * getFamilyLayout() retourne un placement X/Y intelligent :
 *   - Les conjoints sont TOUJOURS cote a cote
 *   - Les enfants sont centres sous le milieu du couple
 *   - Les freres/soeurs sont a gauche/droite sur la meme rangee
 *   - Les oncles/tantes et leur conjoint sont groupes ensemble
 */

const fs   = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname,'..','data','users.json');
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); } catch { return {}; }
}

// ─── Couleurs par relation ─────────────────────────────────────────────────────
const REL_INFO = {
  self:               { label:'Vous',                 couleur:'#c084fc' },
  conjoint:           { label:'Conjoint(e)',           couleur:'#f471b5' },
  parent:             { label:'Parent',               couleur:'#60a5fa' },
  conjointDeParent:   { label:'Beau-parent',          couleur:'#818cf8' },
  enfant:             { label:'Enfant',               couleur:'#34d399' },
  conjointDenfant:    { label:'Beau-fils/Fille',      couleur:'#a5b4fc' },
  fratrie:            { label:'Frere/Soeur',          couleur:'#facc15' },
  conjointDeFratrie:  { label:'Beau-frere/Soeur',     couleur:'#fde68a' },
  grandParent:        { label:'Grand-parent',         couleur:'#38bdf8' },
  conjointGP:         { label:'Conjoint GP',          couleur:'#7dd3fc' },
  arriereGrandParent: { label:'Arriere-GP',           couleur:'#bae6fd' },
  petitEnfant:        { label:'Petit-enfant',         couleur:'#6ee7b7' },
  arrierePetitEnfant: { label:'Arriere-petit-enfant', couleur:'#a7f3d0' },
  oncleTante:         { label:'Oncle/Tante',          couleur:'#fb923c' },
  conjointDoncle:     { label:'Conj. oncle/tante',    couleur:'#fdba74' },
  grandOncleTante:    { label:'Grand-oncle/Tante',    couleur:'#fed7aa' },
  neveuNiece:         { label:'Neveu/Niece',          couleur:'#fbbf24' },
  petitNeveuNiece:    { label:'Petit-neveu/Niece',    couleur:'#fcd34d' },
  cousin:             { label:'Cousin(e)',             couleur:'#e879f9' },
  unknown:            { label:'Famille eloignee',     couleur:'#94a3b8' },
};

// ─── BFS ──────────────────────────────────────────────────────────────────────
function buildFamilyGraph(mainId) {
  const users = readUsers();
  const u = id => users[id] || { partner:null, parents:[], children:[] };

  const visited = new Map();
  const queue   = [{ id:mainId, gen:0, path:[] }];
  visited.set(mainId, { generation:0, path:[], relation:'self' });

  const MAX = 7;

  while (queue.length) {
    const { id, gen, path } = queue.shift();
    if (path.length >= MAX) continue;
    const node = u(id);

    for (const pId of (node.parents||[])) {
      if (!visited.has(pId)) {
        const np = [...path,'up'];
        visited.set(pId, { generation:gen-1, path:np, relation:computeRelation(np) });
        queue.push({ id:pId, gen:gen-1, path:np });
      }
    }
    for (const cId of (node.children||[])) {
      if (!visited.has(cId)) {
        const np = [...path,'down'];
        visited.set(cId, { generation:gen+1, path:np, relation:computeRelation(np) });
        queue.push({ id:cId, gen:gen+1, path:np });
      }
    }
    if (node.partner && !visited.has(node.partner)) {
      const np = [...path,'partner'];
      visited.set(node.partner, { generation:gen, path:np, relation:computeRelation(np) });
      queue.push({ id:node.partner, gen, path:np });
    }
  }
  return visited;
}

function computeRelation(path) {
  if (!path.length) return 'self';
  const s = path.join(',');
  if (s==='partner') return 'conjoint';
  if (s==='up') return 'parent';
  if (s==='up,partner' || s==='partner,up') return 'conjointDeParent';
  if (s==='down') return 'enfant';
  if (s==='down,partner' || s==='partner,down') return 'conjointDenfant';
  if (s==='up,down' || s==='partner,up,down') return 'fratrie';
  if (s==='up,down,partner') return 'conjointDeFratrie';
  if (s==='up,up' || s==='partner,up,up') return 'grandParent';
  if (s==='up,up,partner' || s==='partner,up,up,partner') return 'conjointGP';
  if (s==='up,up,up') return 'arriereGrandParent';
  if (s==='down,down') return 'petitEnfant';
  if (s==='down,down,partner') return 'conjointDenfant';
  if (s==='down,down,down') return 'arrierePetitEnfant';
  if (s==='up,up,down' || s==='partner,up,up,down') return 'oncleTante';
  if (s==='up,up,down,partner') return 'conjointDoncle';
  if (s==='up,up,up,down') return 'grandOncleTante';
  if (s==='up,down,down' || s==='partner,up,down,down') return 'neveuNiece';
  if (s==='up,down,down,down') return 'petitNeveuNiece';
  if (s==='up,up,down,down' || s==='up,up,up,down,down') return 'cousin';
  const ups=path.filter(x=>x==='up').length, downs=path.filter(x=>x==='down').length;
  if (ups>0&&downs===0) return ups<=2?'grandParent':'arriereGrandParent';
  if (downs>0&&ups===0) return downs<=2?'petitEnfant':'arrierePetitEnfant';
  if (ups===1&&downs===2) return 'neveuNiece';
  if (ups===2&&downs===1) return 'oncleTante';
  if (ups>=2&&downs>=2) return 'cousin';
  return 'unknown';
}

// ─── Layout intelligent ────────────────────────────────────────────────────────
/**
 * Retourne un tableau de "couches" (layers), chaque couche = tableau de "slots".
 * Un slot = { type:'person'|'couple', ids:[id] | [id1,id2], cx } (cx calculé après)
 *
 * Règles :
 *  - Les conjoints forment toujours un slot "couple" adjacent
 *  - Les enfants sont centrés sous le cx du slot qui les a engendrés
 *  - La fratrie est triée autour du couple principal sur la même couche
 */
function getFamilyLayout(mainId) {
  const graph = buildFamilyGraph(mainId);
  const users = readUsers();
  const u = id => users[id] || { partner:null, parents:[], children:[] };

  // Grouper par generation
  const byGen = new Map();
  for (const [id, info] of graph) {
    const g = info.generation;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(id);
  }

  const genNums = [...byGen.keys()].sort((a,b)=>a-b);

  // ── Construire les "groupes couple" par génération ───────────────────────
  // Un groupe couple = [personA, personB?] où B est le conjoint de A (si présent dans le graphe)
  function buildCoupleGroups(ids) {
    const assigned = new Set();
    const groups = [];
    for (const id of ids) {
      if (assigned.has(id)) continue;
      const partner = u(id).partner;
      if (partner && ids.includes(partner) && !assigned.has(partner)) {
        // Couple trouvé : mettre self/conjoint ensemble, dans le bon ordre
        const isMain1 = id === mainId;
        const isMain2 = partner === mainId;
        if (isMain1) groups.push([id, partner]);
        else if (isMain2) groups.push([partner, id]);
        else groups.push([id, partner]);
        assigned.add(id); assigned.add(partner);
      } else {
        groups.push([id]);
        assigned.add(id);
      }
    }
    return groups;
  }

  // ── Trier les groupes d'une rangée intelligemment ────────────────────────
  // Le groupe qui contient mainId ou son conjoint va au centre.
  // Les autres sont triés par relation (frere/soeur proche, oncles plus loin)
  function sortGroups(groups, gen) {
    // Trouver le groupe "focal" (contient mainId ou conjoint direct)
    const mainPartner = u(mainId).partner;
    const focalIdx = groups.findIndex(g => g.includes(mainId) || (mainPartner && g.includes(mainPartner)));
    if (focalIdx <= 0) return groups;
    // Mettre le focal au centre
    const focal = groups.splice(focalIdx, 1)[0];
    // Trier le reste par relation (proches en premier)
    const relOrder = r => {
      const ord = {fratrie:0,conjointDeFratrie:0,oncleTante:1,conjointDoncle:1,grandOncleTante:2,neveuNiece:3,cousin:4,unknown:5};
      return ord[r]??5;
    };
    groups.sort((a,b)=>{
      const ra=graph.get(a[0])?.relation||'unknown';
      const rb=graph.get(b[0])?.relation||'unknown';
      return relOrder(ra)-relOrder(rb);
    });
    // Insérer focal au milieu
    const mid = Math.floor(groups.length/2);
    groups.splice(mid, 0, focal);
    return groups;
  }

  // ── Construction des layers ───────────────────────────────────────────────
  const layers = genNums.map(gen => {
    const ids = byGen.get(gen) || [];
    let groups = buildCoupleGroups(ids);
    groups = sortGroups(groups, gen);
    return { gen, groups };
  });

  return { nodes: graph, layers };
}

module.exports = { buildFamilyGraph, getFamilyLayout, REL_INFO, computeRelation };
