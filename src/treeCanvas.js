/**
 * treeCanvas.js — Generateur canvas arbre genealogique complet
 * Utilise familyGraph pour le vrai parcours BFS multi-generations
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG0='#07050f', BG1='#0c0920', BG2='#100d26';
const TEXT='#ede9fe', TEXT2='#9b89cc', TEXTMUT='#4a4060';

// ─── Dimensions ───────────────────────────────────────────────────────────────
const CW=194, CH=70, CR=15;   // card width/height/radius
const AV=22;                  // avatar radius
const HGAP=26;                // horizontal gap between cards
const VGAP=90;                // vertical gap between generations
const PAD=70;                 // canvas padding

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
function hex2rgb(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}
function alpha(h,a){const{r,g,b}=hex2rgb(h);return `rgba(${r},${g},${b},${a})`;}
function lighten(h,t){const{r,g,b}=hex2rgb(h);return `rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`;}

function bezier(ctx,x1,y1,x2,y2,col,a=0.65,w=1.8){
  const my=(y1+y2)/2;
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.bezierCurveTo(x1,my,x2,my,x2,y2);ctx.stroke();ctx.restore();
}
function hline(ctx,x1,y,x2,col,a=0.8){
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=2;ctx.lineCap='round';
  ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();ctx.setLineDash([]);ctx.restore();
}
function vline(ctx,x,y1,y2,col,a=0.65,w=1.8){
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x,y1);ctx.lineTo(x,y2);ctx.stroke();ctx.restore();
}
// Coeur dessiné
function heart(ctx,cx,cy,s=7){
  ctx.save();ctx.fillStyle='#f471b5';ctx.globalAlpha=0.95;
  ctx.beginPath();
  ctx.moveTo(cx,cy+s*0.4);
  ctx.bezierCurveTo(cx,cy-s*0.2,cx-s*1.0,cy-s*0.2,cx-s*1.0,cy+s*0.5);
  ctx.bezierCurveTo(cx-s*1.0,cy+s*1.1,cx,cy+s*1.55,cx,cy+s*1.55);
  ctx.bezierCurveTo(cx,cy+s*1.55,cx+s*1.0,cy+s*1.1,cx+s*1.0,cy+s*0.5);
  ctx.bezierCurveTo(cx+s*1.0,cy-s*0.2,cx,cy-s*0.2,cx,cy+s*0.4);
  ctx.fill();ctx.restore();
}
// Petite patte animaux
function paw(ctx,cx,cy,col,s=7){
  ctx.save();ctx.fillStyle=col;ctx.globalAlpha=0.85;
  ctx.beginPath();ctx.ellipse(cx,cy+s*0.3,s*0.55,s*0.65,0,0,Math.PI*2);ctx.fill();
  [[-0.65,-0.65],[0,-0.88],[0.65,-0.65],[0.95,0.05]].forEach(([dx,dy])=>{
    ctx.beginPath();ctx.ellipse(cx+dx*s*0.5,cy+dy*s*0.55,s*0.26,s*0.3,dx*0.3,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}
// Avatar
async function drawAv(ctx,url,cx,cy,r,col){
  // Halo
  ctx.save();
  const h=ctx.createRadialGradient(cx,cy,r*0.5,cx,cy,r+7);
  h.addColorStop(0,alpha(col,0.3));h.addColorStop(1,alpha(col,0));
  ctx.fillStyle=h;ctx.beginPath();ctx.arc(cx,cy,r+7,0,Math.PI*2);ctx.fill();ctx.restore();
  // Ring
  ctx.save();ctx.strokeStyle=col;ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(cx,cy,r+1,0,Math.PI*2);ctx.stroke();ctx.restore();
  // Image
  if(url){
    try{
      const img=await loadImage(url+'?size=64');
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
      ctx.drawImage(img,cx-r,cy-r,r*2,r*2);ctx.restore();return;
    }catch{}
  }
  // Fallback
  ctx.save();
  const g=ctx.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  g.addColorStop(0,lighten(col,.25));g.addColorStop(1,col);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='#fff';ctx.font=`bold ${r}px sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',cx,cy+1);ctx.restore();
}
// Carte
async function drawCard(ctx,x,y,opts){
  const{name,role,avURL,col,isMain,pets}=opts;
  // Ombre/glow
  ctx.save();ctx.shadowColor=alpha(col,isMain?.5:.25);ctx.shadowBlur=isMain?26:12;
  rr(ctx,x,y,CW,CH,CR);ctx.fillStyle='#1a1030';ctx.fill();ctx.restore();
  // Fond gradient
  const gf=ctx.createLinearGradient(x,y,x+CW,y+CH);
  gf.addColorStop(0,lighten(col,.06));gf.addColorStop(1,'#120e24');
  rr(ctx,x,y,CW,CH,CR);ctx.fillStyle=gf;ctx.fill();
  // Bordure
  ctx.save();if(isMain){ctx.shadowColor=col;ctx.shadowBlur=10;}
  ctx.strokeStyle=col;ctx.lineWidth=isMain?2.5:1.6;ctx.globalAlpha=.85;
  rr(ctx,x,y,CW,CH,CR);ctx.stroke();ctx.restore();
  // Barre top
  ctx.save();ctx.globalAlpha=.5;
  const bar=ctx.createLinearGradient(x+CR,y,x+CW-CR,y);
  bar.addColorStop(0,'transparent');bar.addColorStop(.3,col);bar.addColorStop(.7,col);bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar;ctx.fillRect(x+CR,y,CW-CR*2,1.5);ctx.restore();
  // Avatar
  const avX=x+AV+12,avY=y+CH/2;
  await drawAv(ctx,avURL,avX,avY,AV,col);
  // Pattes animaux
  if(pets&&pets.length){
    const PC={chien:'#fb923c',chat:'#f471b5',poisson:'#60a5fa',serpent:'#34d399',oiseau:'#facc15'};
    pets.slice(0,3).forEach((p,i)=>paw(ctx,x+CW-14-i*14,y+12,PC[p.type]||'#aaa',5));
  }
  // Nom
  const tx=x+AV*2+18, maxW=CW-AV*2-24;
  ctx.save();ctx.fillStyle=TEXT;ctx.font=(isMain?'bold ':'600 ')+'14px sans-serif';ctx.textBaseline='middle';
  let n=name;while(n.length>1&&ctx.measureText(n).width>maxW)n=n.slice(0,-1);
  if(n!==name)n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+CH/2-(role?8:0));
  if(role){
    ctx.fillStyle=alpha(col,.9);ctx.font='10.5px sans-serif';
    let r2=role;while(r2.length>1&&ctx.measureText(r2).width>maxW)r2=r2.slice(0,-1);
    if(r2!==role)r2=r2.slice(0,-1)+'..';
    ctx.fillText(r2,tx,y+CH/2+9);
  }
  ctx.restore();
}

// ─── GENERATEUR PRINCIPAL ─────────────────────────────────────────────────────
async function generateFamilyTree(treeData, userMap, mainId) {
  // On utilise le vrai layout BFS
  const { nodes, generations, genRange } = getFamilyLayout(mainId);

  // ── Filtrer : garder max 5 générations visibles, centrées sur soi ─────────
  // et limiter à 8 personnes par génération pour garder un canvas lisible
  const MAX_PER_ROW = 8;
  const allGens = [...generations.keys()].sort((a,b)=>a-b);

  // Construire la grille de rendu : genIndex (0-based) -> [ids]
  // On garde toutes les gens entre min et max
  const renderRows = [];
  for (const gen of allGens) {
    let ids = generations.get(gen) || [];
    // Limiter en gardant les plus proches du sujet en priorité
    if (ids.length > MAX_PER_ROW) {
      const prioritized = ids.sort((a,b) => {
        const pa = nodes.get(a)?.path?.length || 99;
        const pb = nodes.get(b)?.path?.length || 99;
        return pa-pb;
      });
      ids = prioritized.slice(0, MAX_PER_ROW);
    }
    renderRows.push({ gen, ids });
  }

  const nRows = renderRows.length;
  const maxCols = Math.max(...renderRows.map(r=>r.ids.length), 1);

  // ── Dimensions canvas ─────────────────────────────────────────────────────
  const W = Math.max(PAD*2 + maxCols*CW + (maxCols-1)*HGAP, 700);
  const H = Math.max(PAD*2 + nRows*CH + (nRows-1)*VGAP + 50, 380);

  const canvas = createCanvas(W,H);
  const ctx = canvas.getContext('2d');

  // ── Fond ──────────────────────────────────────────────────────────────────
  const bg=ctx.createLinearGradient(0,0,W*.6,H);
  bg.addColorStop(0,BG0);bg.addColorStop(.5,BG1);bg.addColorStop(1,BG2);
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  // Nebuleuses
  [[.15,.2,.4,'rgba(70,15,130,.12)'],[.85,.75,.3,'rgba(15,50,110,.09)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc);n.addColorStop(1,'transparent');ctx.fillStyle=n;ctx.fillRect(0,0,W,H);
  });
  // Etoiles
  for(let i=0;i<100;i++){
    ctx.save();ctx.fillStyle='#c4b5fd';ctx.globalAlpha=Math.random()*.2+.03;
    ctx.beginPath();ctx.arc(Math.random()*W,Math.random()*H,Math.random()*1.1+.2,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  // ── Calculer les positions X,Y de chaque carte ────────────────────────────
  const cardPos = {}; // id -> {x,y,cx,cy}

  renderRows.forEach((row, rowIdx) => {
    const y = PAD + rowIdx*(CH+VGAP);
    const totalW = row.ids.length*CW + (row.ids.length-1)*HGAP;

    // Centrer la rangée
    // Exception : si mainId est dans cette rangée, forcer la rangée à être centrée sur lui
    const mainInRow = row.ids.includes(mainId);
    const partnerInRow = row.ids.some(id => nodes.get(id)?.relation === 'conjoint');

    let startX = (W - totalW) / 2;

    // Réordonner : self + conjoint au centre, reste autour
    let orderedIds = [...row.ids];
    if (mainInRow) {
      // Séparer self+conjoint du reste
      const selfCouple = orderedIds.filter(id => id===mainId || nodes.get(id)?.relation==='conjoint');
      const others = orderedIds.filter(id => id!==mainId && nodes.get(id)?.relation!=='conjoint');
      // Mettre others à gauche, selfCouple au milieu, ... ou grouper par relation
      orderedIds = [...others.slice(0,Math.floor(others.length/2)), ...selfCouple, ...others.slice(Math.floor(others.length/2))];
    }

    orderedIds.forEach((id, i) => {
      const x = startX + i*(CW+HGAP);
      cardPos[id] = { x, y, cx: x+CW/2, cy: y+CH/2 };
    });
  });

  // ── Dessiner les lignes de connexion ──────────────────────────────────────
  // Pour chaque node, on trace une ligne vers son parent (dans le graphe BFS)
  const users_raw = (() => { try{const fs=require('fs'),p=require('path');return JSON.parse(fs.readFileSync(p.join(__dirname,'..','data','users.json'),'utf8'));}catch{return{};} })();
  function getU(id){return users_raw[id]||{partner:null,parents:[],children:[]};}

  // On trace les connexions structurelles :
  // 1. Liens parent -> enfant (vertical)
  // 2. Liens conjoint (horizontal pointillé)

  const drawn = new Set();

  for (const [id, info] of nodes) {
    const pos = cardPos[id];
    if (!pos) continue;

    const node = getU(id);
    const rel = info.relation;
    const nodeColor = REL_INFO[rel]?.couleur || '#7c3aed';

    // ── Lien vers les parents ────────────────────────────────────────────────
    for (const pId of (node.parents||[])) {
      const pPos = cardPos[pId];
      if (!pPos) continue;
      const ek = [id,pId].sort().join(':');
      if (drawn.has(ek)) continue;
      drawn.add(ek);

      const pInfo = nodes.get(pId);
      const pColor = REL_INFO[pInfo?.relation||'unknown']?.couleur||'#7c3aed';
      const lineColor = pColor;
      const fromY = pPos.y + CH;
      const toY   = pos.y;

      // Si plusieurs enfants du même parent -> T-junction
      const siblings = (node.parents||[]).length > 0
        ? [...(nodes.keys())].filter(sId => {
            const s=getU(sId);
            return s.parents?.includes(pId) && cardPos[sId] && sId!==id;
          })
        : [];

      if (siblings.length === 0) {
        bezier(ctx, pPos.cx, fromY, pos.cx, toY, lineColor, .7, 2);
      } else {
        // Branche : tige + barre horizontale + descentes
        const allChildren = [id, ...siblings].filter(cId => cardPos[cId]);
        const allCx = allChildren.map(cId => cardPos[cId].cx);
        const midY = fromY + VGAP/2;
        const minCx = Math.min(...allCx), maxCx = Math.max(...allCx);

        // Tige du parent vers le milieu
        const parentMidCx = (node.parents||[]).reduce((s,pid2)=>s+(cardPos[pid2]?.cx||0),0)/(node.parents.length||1);

        vline(ctx,pPos.cx,fromY,midY,lineColor,.65,1.8);
        // Barre horizontale
        ctx.save();ctx.globalAlpha=.55;ctx.strokeStyle=lineColor;ctx.lineWidth=1.8;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(minCx,midY);ctx.lineTo(maxCx,midY);ctx.stroke();ctx.restore();
        // Descentes
        allChildren.forEach(cId=>{
          const cp=cardPos[cId];
          if(!cp)return;
          vline(ctx,cp.cx,midY,cp.y,lineColor,.65,1.8);
        });
      }
    }

    // ── Lien conjoint ────────────────────────────────────────────────────────
    if (node.partner) {
      const pPos = cardPos[node.partner];
      if (pPos) {
        const ek = [id,node.partner].sort().join(':partner:');
        if (!drawn.has(ek)) {
          drawn.add(ek);
          const ly = pos.cy;
          const x1 = Math.min(pos.cx,pPos.cx) + CW/2 - 6;
          const x2 = Math.max(pos.cx,pPos.cx) - CW/2 + 6;
          if (x2 > x1) {
            hline(ctx, x1, ly, x2, '#f471b5', .85);
            heart(ctx, (x1+x2)/2, ly-9, 7);
          }
        }
      }
    }
  }

  // ── Dessiner les cartes ───────────────────────────────────────────────────
  const cardPromises = [];
  for (const [id, info] of nodes) {
    const pos = cardPos[id];
    if (!pos) continue;
    const u = userMap[id] || { username:'Inconnu', avatarURL:null, pets:[] };
    const rel = info.relation;
    const relInfo = REL_INFO[rel] || REL_INFO.unknown;
    const isMain = id === mainId;
    cardPromises.push(drawCard(ctx, pos.x, pos.y, {
      name:  u.username,
      role:  isMain ? null : relInfo.label,
      avURL: u.avatarURL,
      col:   relInfo.couleur,
      isMain,
      pets:  u.pets||[],
    }));
  }
  await Promise.all(cardPromises);

  // ── Titre ─────────────────────────────────────────────────────────────────
  const mUser = userMap[mainId];
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-180,0,W/2+180,0);
  tg.addColorStop(0,'#c084fc');tg.addColorStop(.5,'#ede9fe');tg.addColorStop(1,'#f471b5');
  ctx.fillStyle=tg;ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  ctx.shadowColor='#9333ea';ctx.shadowBlur=18;
  ctx.fillText(`Arbre de ${mUser?.username??'???'}`, W/2, 14);
  ctx.restore();

  // ── Compteur membres ──────────────────────────────────────────────────────
  const memberCount = [...nodes.keys()].filter(id=>cardPos[id]).length;
  ctx.save();ctx.fillStyle=TEXTMUT;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  ctx.fillText(`${memberCount} membres dans la famille`, W/2, 42);ctx.restore();

  // ── Légende ───────────────────────────────────────────────────────────────
  // On n'affiche que les relations effectivement presentes
  const presentRels = new Set([...nodes.values()].map(n=>n.relation));
  const legendItems = Object.entries(REL_INFO).filter(([k])=>presentRels.has(k) && k!=='self');
  const LI_W = 130;
  const perRow = Math.floor((W-PAD*2)/LI_W);
  const legendRows = [];
  for(let i=0;i<legendItems.length;i+=perRow) legendRows.push(legendItems.slice(i,i+perRow));

  legendRows.forEach((row,ri)=>{
    const totalW2=row.length*LI_W;
    const lx=(W-totalW2)/2;
    const ly=H-18-(legendRows.length-1-ri)*16;
    row.forEach(([,info],i)=>{
      const x=lx+i*LI_W;
      ctx.save();ctx.fillStyle=info.couleur;ctx.globalAlpha=.9;
      ctx.beginPath();ctx.arc(x+6,ly,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=TEXTMUT;ctx.font='10px sans-serif';ctx.textBaseline='middle';ctx.globalAlpha=.75;
      ctx.fillText(info.label,x+14,ly);ctx.restore();
    });
  });

  return canvas.toBuffer('image/png');
}

module.exports = { generateFamilyTree };
