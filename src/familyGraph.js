/**
 * familyGraph.js
 *
 * Parcours BFS complet du graphe familial a partir d'un membre.
 * Retourne pour chaque membre trouve :
 *   - son "rang de generation" relatif au sujet (0=soi, -1=parents, -2=GP, +1=enfants...)
 *   - sa relation exacte (conjoint, parent, enfant, frere/soeur, oncle/tante, neveu/niece,
 *                         grand-parent, arriere-grand-parent, petit-enfant, arriere-petit-enfant,
 *                         cousin, grand-oncle/tante, conjoint de parent, conjoint d'enfant...)
 *   - le chemin qui relie au sujet
 *
 * Le graphe est non-oriente : on peut remonter via parents, descendre via children,
 * et traverser via partner.
 */

const fs   = require('fs');
const path = require('path');

// On relit directement users.json pour ne pas creer de dep circulaire
const USERS_FILE = path.join(__dirname,'..','data','users.json');
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); } catch { return {}; }
}

// ─── Relations label ─────────────────────────────────────────────────────────
// Chaque entree = [label masculin/neutre, couleur canvas]
const REL_INFO = {
  self:                   { label:'Vous',                couleur:'#c084fc' },
  conjoint:               { label:'Conjoint(e)',         couleur:'#f471b5' },
  parent:                 { label:'Parent',              couleur:'#60a5fa' },
  enfant:                 { label:'Enfant',              couleur:'#34d399' },
  fratrie:                { label:'Frere/Soeur',         couleur:'#facc15' },
  grandParent:            { label:'Grand-parent',        couleur:'#38bdf8' },
  arriereGrandParent:     { label:'Arriere-grand-parent',couleur:'#7dd3fc' },
  petitEnfant:            { label:'Petit-enfant',        couleur:'#6ee7b7' },
  arrierePetitEnfant:     { label:'Arriere-petit-enfant',couleur:'#a7f3d0' },
  oncleTante:             { label:'Oncle/Tante',         couleur:'#fb923c' },
  grandOncleTante:        { label:'Grand-oncle/Tante',   couleur:'#fdba74' },
  neveuNiece:             { label:'Neveu/Niece',         couleur:'#fbbf24' },
  petitNeveuNiece:        { label:'Petit-neveu/Niece',   couleur:'#fcd34d' },
  cousin:                 { label:'Cousin(e)',           couleur:'#e879f9' },
  conjointDeParent:       { label:'Beau-pere/Mere',      couleur:'#818cf8' },
  conjointDenfant:        { label:'Beau-fils/Fille',     couleur:'#a5b4fc' },
  conjointDeFratrie:      { label:'Beau-frere/Soeur',    couleur:'#fde68a' },
  conjointDoncle:         { label:'Conjoint oncle/tante',couleur:'#fdba74' },
  unknown:                { label:'Famille eloignee',    couleur:'#94a3b8' },
};

/**
 * Calcule le graphe familial complet depuis mainId.
 *
 * @returns {Map<string, NodeInfo>}  userId -> { relation, generation, rank, pathFrom }
 *
 * generation = position verticale entiere (0=soi)
 * rank = position dans la "colonne" horizontale (calculee apres)
 */
function buildFamilyGraph(mainId) {
  const users = readUsers();
  function u(id) { return users[id] || { partner:null, parents:[], children:[] }; }

  // BFS
  // queue item : { id, generation, pathType[] }
  // pathType : 'up'=vers parent, 'down'=vers enfant, 'partner'=vers conjoint, 'sib'=vers frere
  const visited = new Map(); // id -> { generation, pathTypes, relation }
  const queue   = [{ id: mainId, gen: 0, path: [] }];
  visited.set(mainId, { generation: 0, path: [], relation: 'self' });

  const MAX_DEPTH = 6; // limite de profondeur pour eviter les boucles infinies

  while (queue.length) {
    const { id, gen, path } = queue.shift();
    if (path.length >= MAX_DEPTH) continue;

    const node = u(id);

    // ── Vers les parents ────────────────────────────────────────────────────
    for (const pId of (node.parents||[])) {
      if (!visited.has(pId)) {
        const newPath = [...path, 'up'];
        visited.set(pId, { generation: gen-1, path: newPath, relation: computeRelation(newPath) });
        queue.push({ id: pId, gen: gen-1, path: newPath });
      }
    }

    // ── Vers les enfants ────────────────────────────────────────────────────
    for (const cId of (node.children||[])) {
      if (!visited.has(cId)) {
        const newPath = [...path, 'down'];
        visited.set(cId, { generation: gen+1, path: newPath, relation: computeRelation(newPath) });
        queue.push({ id: cId, gen: gen+1, path: newPath });
      }
    }

    // ── Vers le conjoint ────────────────────────────────────────────────────
    if (node.partner && !visited.has(node.partner)) {
      const newPath = [...path, 'partner'];
      visited.set(node.partner, { generation: gen, path: newPath, relation: computeRelation(newPath) });
      queue.push({ id: node.partner, gen, path: newPath });
    }
  }

  return visited;
}

/**
 * Deduit la relation a partir du chemin de navigation.
 * path = tableau de 'up','down','partner'
 */
function computeRelation(path) {
  if (!path.length) return 'self';

  // Normaliser : compresser les suites up/down
  // compter les montees et descentes consecutives

  // Analyser la forme du chemin
  const s = path.join(',');

  // Conjoints directs
  if (s === 'partner') return 'conjoint';

  // Parents directs
  if (s === 'up') return 'parent';
  if (s === 'up,partner') return 'conjointDeParent';

  // Enfants directs
  if (s === 'down') return 'enfant';
  if (s === 'down,partner') return 'conjointDenfant';

  // Fratrie
  if (s === 'up,down') return 'fratrie';
  if (s === 'up,down,partner') return 'conjointDeFratrie';
  if (s === 'partner,up,down' || s === 'partner,down') return 'fratrie'; // demi-frere via conjoint parent

  // Grands-parents
  if (s === 'up,up') return 'grandParent';
  if (s === 'up,up,partner') return 'conjointDeParent'; // grand-beau-parent

  // Arriere-grands-parents
  if (s === 'up,up,up') return 'arriereGrandParent';

  // Petits-enfants
  if (s === 'down,down') return 'petitEnfant';
  if (s === 'down,down,down') return 'arrierePetitEnfant';

  // Oncles/tantes (frere/soeur d'un parent)
  if (s === 'up,up,down' || s === 'up,partner,up,down') return 'oncleTante';
  if (s === 'up,up,down,partner') return 'conjointDoncle';

  // Grand-oncles/tantes (frere/soeur d'un grand-parent)
  if (s === 'up,up,up,down') return 'grandOncleTante';

  // Neveux/nieces (enfant d'un frere/soeur)
  if (s === 'up,down,down') return 'neveuNiece';
  if (s === 'up,down,down,down') return 'petitNeveuNiece';

  // Cousins (enfant d'oncle/tante)
  if (s === 'up,up,down,down') return 'cousin';
  if (s === 'up,up,up,down,down') return 'cousin'; // cousin issu de germain

  // Formes avec partner au debut (conjoint du sujet -> sa famille)
  if (s.startsWith('partner,up,up')) return 'grandParent';
  if (s.startsWith('partner,up') && !s.includes('down')) return 'parent';
  if (s.startsWith('partner,down') && !s.includes('up')) return 'enfant';
  if (s.startsWith('partner,up,down')) return 'fratrie';
  if (s.startsWith('partner,up,up,down')) return 'oncleTante';

  // Compter les up et down pour une estimation
  const ups   = path.filter(x=>x==='up').length;
  const downs = path.filter(x=>x==='down').length;
  const partners = path.filter(x=>x==='partner').length;

  if (ups > 0 && downs === 0) return ups<=3 ? 'grandParent' : 'arriereGrandParent';
  if (downs > 0 && ups === 0) return downs<=2 ? 'petitEnfant' : 'arrierePetitEnfant';
  if (ups === 1 && downs === 2) return 'neveuNiece';
  if (ups === 2 && downs === 1) return 'oncleTante';
  if (ups >= 2 && downs >= 2) return 'cousin';
  if (partners > 0) return 'conjoint';

  return 'unknown';
}

/**
 * Groupe les membres par generation et calcule les positions X/Y pour le canvas.
 *
 * @param {string} mainId
 * @returns {{
 *   nodes: Map<string, {generation, relation, x?, y?}>,
 *   generations: Map<number, string[]>,   // gen -> [ids]
 *   genRange: {min, max}
 * }}
 */
function getFamilyLayout(mainId) {
  const graph = buildFamilyGraph(mainId);

  // Grouper par generation
  const generations = new Map();
  for (const [id, info] of graph) {
    const g = info.generation;
    if (!generations.has(g)) generations.set(g, []);
    generations.get(g).push(id);
  }

  // Trier les generations
  const genNums = [...generations.keys()].sort((a,b)=>a-b);
  const genRange = { min: genNums[0]||0, max: genNums[genNums.length-1]||0 };

  // Dans chaque generation, mettre le sujet et son conjoint au centre
  for (const [gen, ids] of generations) {
    // Trier : self d'abord, puis conjoint, puis le reste
    ids.sort((a,b) => {
      const ra = graph.get(a)?.relation;
      const rb = graph.get(b)?.relation;
      const order = (r) => r==='self'?0 : r==='conjoint'?1 : r==='parent'?2 : r==='fratrie'?3 : 4;
      return order(ra)-order(rb);
    });
  }

  return { nodes: graph, generations, genRange };
}

module.exports = { buildFamilyGraph, getFamilyLayout, REL_INFO, computeRelation };
