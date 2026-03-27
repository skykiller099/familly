'use strict';
/**
 * treeCanvas.js — v12
 * - Layout hiérarchique bottom-up → top-down avec résolution de chevauchements
 * - Taille de cartes 100% dynamique : on calcule d'abord le nb de cols max
 *   et on réduit CW/CH proportionnellement pour tenir dans MAX_W × MAX_H
 * - Responsive : si beaucoup de membres, les cartes rétrécissent jusqu'à MIN_CW
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');
const fs = require('fs'), pt = require('path');

const MAX_W = 1200, MAX_H = 980;
// Taille base d'une carte
const BASE_CW = 174, BASE_CH = 68, BASE_CR = 11, BASE_AV = 19;
const MIN_CW   = 90,  MIN_CH  = 42; // plancher absolu
const BASE_CGAP = 6, BASE_GGAP = 26, BASE_VGAP = 80;
const PAD = 44, TITLE_H = 44, LEG_ROW_H = 16;

const COL = {
  bg0:'#050310', bg1:'#08061a', bg2:'#0c0920',
  card:'#0a0718', text:'#ede8ff', muted:'#332d50', heart:'#f472b6',
};
const RC = {
  self:'#c084fc', conjoint:'#f472b6',
  parent:'#60a5fa', conjointDeParent:'#818cf8',
  enfant:'#34d399', conjointDenfant:'#6ee7b7',
  fratrie:'#fbbf24', conjointDeFratrie:'#fde68a',
  grandParent:'#38bdf8', conjointGP:'#7dd3fc',
  arriereGrandParent:'#bae6fd',
  petitEnfant:'#10b981', arrierePetitEnfant:'#6ee7b7',
  oncleTante:'#f97316', conjointDoncle:'#fdba74',
  grandOncleTante:'#fed7aa',
  neveuNiece:'#f59e0b', petitNeveuNiece:'#fcd34d',
  cousin:'#e879f9', unknown:'#64748b',
};
Object.entries(RC).forEach(([k,v])=>{ if(REL_INFO[k]) REL_INFO[k].couleur=v; });

// helpers couleur
const h2r = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const rgba = (h,a) => { const[r,g,b]=h2r(h); return `rgba(${r},${g},${b},${a})`; };
const lite = (h,t) => { const[r,g,b]=h2r(h); return `rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`; };

// helpers canvas
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();
}
function seg(ctx,x1,y1,x2,y2,col,a,lw,dash){
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.lineCap='round';
  if(dash)ctx.setLineDash(dash);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.setLineDash([]);ctx.restore();
}
function heartDraw(ctx,cx,cy,s,col){
  ctx.save();ctx.fillStyle=col;ctx.globalAlpha=.95;
  ctx.beginPath();
  ctx.moveTo(cx,cy+s*.35);
  ctx.bezierCurveTo(cx,cy-s*.2,cx-s,cy-s*.2,cx-s,cy+s*.45);
  ctx.bezierCurveTo(cx-s,cy+s,cx,cy+s*1.5,cx,cy+s*1.5);
  ctx.bezierCurveTo(cx,cy+s*1.5,cx+s,cy+s,cx+s,cy+s*.45);
  ctx.bezierCurveTo(cx+s,cy-s*.2,cx,cy-s*.2,cx,cy+s*.35);
  ctx.closePath();ctx.fill();ctx.restore();
}

// avatar
async function drawAv(ctx,url,cx,cy,r,col){
  ctx.save();
  const gl=ctx.createRadialGradient(cx,cy,r*.35,cx,cy,r+r*.2);
  gl.addColorStop(0,rgba(col,.3));gl.addColorStop(1,rgba(col,0));
  ctx.fillStyle=gl;ctx.beginPath();ctx.arc(cx,cy,r+r*.2,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.strokeStyle=col;ctx.lineWidth=Math.max(.8,r*.09);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.restore();
  if(url){try{
    const img=await loadImage(url+'?size=64');
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    ctx.drawImage(img,cx-r,cy-r,r*2,r*2);ctx.restore();return;
  }catch{}}
  ctx.save();
  const fg=ctx.createRadialGradient(cx-r*.22,cy-r*.22,0,cx,cy,r);
  fg.addColorStop(0,lite(col,.3));fg.addColorStop(1,col);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=fg;ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='#fff';ctx.font=`bold ${Math.round(r*.8)}px sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',cx,cy+.5);ctx.restore();
}

// pet badges (en bas-droite de la carte)
const PA={chien:'D',chat:'C',poisson:'P',serpent:'S',oiseau:'O'};
function petBadges(ctx,pets,x,y,cw,ch,col,scale){
  if(!pets||!pets.length)return;
  const br=Math.max(3,Math.round(scale*6)),gap=Math.max(2,Math.round(scale*3));
  const tot=pets.length*(br*2+gap)-gap;
  let bx=x+cw-tot-Math.round(scale*5);
  const by=y+ch-br-Math.round(scale*5);
  pets.forEach(pet=>{
    ctx.save();
    ctx.fillStyle=rgba(col,.28);ctx.strokeStyle=rgba(col,.8);ctx.lineWidth=Math.max(.5,scale*.8);
    ctx.beginPath();ctx.arc(bx+br,by,br,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=`bold ${Math.round(br*.85)}px sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(PA[pet.type]||'?',bx+br,by+.5);
    ctx.restore();bx+=br*2+gap;
  });
}

// carte
async function drawCard(ctx,x,y,cw,ch,cr,av,col,name,role,avURL,isMain,pets,scale){
  ctx.save();ctx.shadowColor=rgba(col,isMain?.55:.22);ctx.shadowBlur=Math.round(isMain?18:8);
  rr(ctx,x,y,cw,ch,cr);ctx.fillStyle=COL.card;ctx.fill();ctx.restore();
  const gf=ctx.createLinearGradient(x,y,x+cw,y+ch);
  gf.addColorStop(0,lite(col,.09));gf.addColorStop(1,COL.card);
  rr(ctx,x,y,cw,ch,cr);ctx.fillStyle=gf;ctx.fill();
  ctx.save();if(isMain){ctx.shadowColor=rgba(col,.6);ctx.shadowBlur=Math.round(scale*8);}
  rr(ctx,x,y,cw,ch,cr);ctx.strokeStyle=col;
  ctx.lineWidth=Math.max(.7,isMain?scale*2.3:scale*1.5);ctx.globalAlpha=.88;ctx.stroke();ctx.restore();
  ctx.save();ctx.globalAlpha=.38;
  const bar=ctx.createLinearGradient(x+cr,y,x+cw-cr,y);
  bar.addColorStop(0,'transparent');bar.addColorStop(.3,col);bar.addColorStop(.7,col);bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar;ctx.fillRect(x+cr,y,cw-cr*2,Math.max(1,scale*1.5));ctx.restore();
  const avX=x+av+Math.round(scale*8),avY=y+ch/2;
  await drawAv(ctx,avURL||null,avX,avY,av,col);
  const tx=avX+av+Math.round(scale*8),maxTW=cw-av*2-Math.round(scale*22);
  const nfs=Math.max(7,Math.round(ch*.195)),rfs=Math.max(6,Math.round(ch*.148));
  ctx.save();ctx.fillStyle=COL.text;ctx.textBaseline='middle';
  ctx.font=(isMain?'bold ':'')+`${nfs}px sans-serif`;
  let n=name;while(n.length>1&&ctx.measureText(n).width>maxTW)n=n.slice(0,-1);
  if(n!==name)n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+ch/2-(role?ch*.115:0));
  if(role){
    ctx.fillStyle=rgba(col,.9);ctx.font=`${rfs}px sans-serif`;
    let ro=role;while(ro.length>1&&ctx.measureText(ro).width>maxTW)ro=ro.slice(0,-1);
    if(ro!==role)ro=ro.slice(0,-1)+'..';
    ctx.fillText(ro,tx,y+ch/2+ch*.115);
  }
  ctx.restore();
  petBadges(ctx,pets,x,y,cw,ch,col,scale);
}

// fond
function drawBg(ctx,W,H){
  const bg=ctx.createLinearGradient(0,0,W*.55,H);
  bg.addColorStop(0,COL.bg0);bg.addColorStop(.5,COL.bg1);bg.addColorStop(1,COL.bg2);
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  [[.1,.14,.5,'rgba(44,4,98,.16)'],[.88,.82,.28,'rgba(4,28,88,.13)'],[.5,.5,.38,'rgba(12,1,44,.1)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc);n.addColorStop(1,'transparent');ctx.fillStyle=n;ctx.fillRect(0,0,W,H);
  });
  const ns=Math.min(160,Math.round(W*.11));
  for(let i=0;i<ns;i++){
    ctx.save();ctx.globalAlpha=Math.random()*.15+.02;ctx.fillStyle='#c4b5fd';
    ctx.beginPath();ctx.arc(Math.random()*W,Math.random()*H,Math.random()*.75+.1,0,Math.PI*2);
    ctx.fill();ctx.restore();
  }
}

// titre
function drawTitle(ctx,W,name,count){
  const fs1=Math.max(14,Math.round(Math.min(W/20,22))),fs2=Math.max(9,Math.round(fs1*.47));
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-140,0,W/2+140,0);
  tg.addColorStop(0,'#a855f7');tg.addColorStop(.5,'#ede9fe');tg.addColorStop(1,'#ec4899');
  ctx.fillStyle=tg;ctx.font=`bold ${fs1}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
  ctx.shadowColor='rgba(168,85,247,.5)';ctx.shadowBlur=10;
  ctx.fillText(`Arbre de ${name}`,W/2,PAD*.6);ctx.restore();
  ctx.save();ctx.fillStyle=COL.muted;ctx.font=`${fs2}px sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='top';
  ctx.fillText(`${count} membre${count>1?'s':''}`,W/2,PAD*.6+fs1+4);ctx.restore();
}

// légende
function drawLegend(ctx,W,H,graph){
  const rels=[...new Set([...graph.values()].map(n=>n.relation))].filter(r=>r!=='self');
  const items=rels.map(r=>[r,REL_INFO[r]||{label:r,couleur:'#64748b'}]);
  if(!items.length)return;
  const iW=112,perRow=Math.max(1,Math.floor((W-60)/iW));
  const rows=[];for(let i=0;i<items.length;i+=perRow)rows.push(items.slice(i,i+perRow));
  const totalH=rows.length*LEG_ROW_H+6;
  const legY=H-totalH-6;
  rows.forEach((row,ri)=>{
    const tw=row.length*iW,lx=(W-tw)/2,y=legY+ri*LEG_ROW_H;
    row.forEach(([,info],ci)=>{
      const x=lx+ci*iW;
      ctx.save();ctx.fillStyle=info.couleur;ctx.globalAlpha=.9;
      ctx.beginPath();ctx.arc(x+4,y,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#584e7a';ctx.font='10px sans-serif';
      ctx.textBaseline='middle';ctx.globalAlpha=.78;
      ctx.fillText(info.label,x+10,y);ctx.restore();
    });
  });
  return totalH+12;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL DES DIMENSIONS DE CARTE selon le contenu
// ─────────────────────────────────────────────────────────────────────────────
function calcCardSize(layers) {
  // Nb max de cartes par rangée
  let maxCards = 0;
  for (const layer of layers) {
    const n = layer.groups.reduce((s,g)=>s+g.length, 0);
    maxCards = Math.max(maxCards, n);
  }
  const nRows = layers.length;

  // On cherche la taille de carte qui fait tout tenir dans MAX_W × MAX_H
  // En commençant par la taille base et en réduisant si nécessaire
  let cw = BASE_CW, ch = BASE_CH;

  for (let tries = 0; tries < 20; tries++) {
    const cgap = Math.round(BASE_CGAP*(cw/BASE_CW));
    const ggap = Math.round(BASE_GGAP*(cw/BASE_CW));
    const vgap = Math.round(BASE_VGAP*(ch/BASE_CH));
    // Largeur d'une rangée de maxCards cartes (approx)
    const rowW = maxCards*cw + (maxCards-1)*ggap + PAD*2;
    const colH = nRows*(ch+vgap) - vgap + TITLE_H + PAD*2 + LEG_ROW_H*4;
    if (rowW <= MAX_W && colH <= MAX_H) break;
    // Réduire proportionnellement
    const sx = MAX_W / rowW, sy = MAX_H / colH;
    const s = Math.max(0.5, Math.min(sx, sy));
    cw = Math.max(MIN_CW, Math.round(cw * s));
    ch = Math.max(MIN_CH, Math.round(ch * s));
  }
  const scale = cw / BASE_CW;
  return {
    cw, ch,
    cr:  Math.max(4, Math.round(BASE_CR  * scale)),
    av:  Math.max(8, Math.round(BASE_AV  * scale)),
    cgap:Math.max(3, Math.round(BASE_CGAP* scale)),
    ggap:Math.max(8, Math.round(BASE_GGAP* scale)),
    vgap:Math.max(30,Math.round(BASE_VGAP* scale)),
    scale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHME DE PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────
function buildLayout(layers, mainId, db, dims) {
  const { cw, ch, cgap, ggap, vgap } = dims;
  const gw = g => g.length===1 ? cw : cw*2+cgap;

  // Y de chaque rangée
  const yOf = li => TITLE_H + li*(ch+vgap);

  // cx_of[id] = centre X de la carte (relatif, ancré sur 0)
  const cx_of = new Map();

  // ── Pass 1 : placement initial centré sur mainId ──────────────────────────
  layers.forEach((layer, li) => {
    const totalW = layer.groups.reduce((s,g,i)=>s+gw(g)+(i>0?ggap:0),0);
    const fgi = layer.groups.findIndex(g=>g.includes(mainId));
    let startX;
    if (fgi >= 0) {
      let pre=0; for(let gi=0;gi<fgi;gi++) pre+=gw(layer.groups[gi])+ggap;
      startX = -(pre + gw(layer.groups[fgi])/2);
    } else {
      startX = -totalW/2;
    }
    let curX = startX;
    layer.groups.forEach(group => {
      if (group.length===1) {
        cx_of.set(group[0], curX+cw/2);
      } else {
        cx_of.set(group[0], curX+cw/2);
        cx_of.set(group[1], curX+cw+cgap+cw/2);
      }
      curX += gw(group)+ggap;
    });
  });

  // ── Pass 2 : centrer chaque rangée sous/sur ses connexions (4 itérations) ─
  for (let iter=0; iter<4; iter++) {
    // Bottom-up : centrer les parents sur leurs enfants
    for (let li=layers.length-2; li>=0; li--) {
      const layerIds  = layers[li].groups.flat();
      const nextIds   = layers[li+1].groups.flat();
      // Pour chaque groupe de parents, trouver leurs enfants communs
      layers[li].groups.forEach(group => {
        if (group.includes(mainId)) return; // ne pas déplacer le focal
        const kids = nextIds.filter(c => {
          const cParents = (db[c]?.parents||[]).filter(p=>group.includes(p));
          return cParents.length > 0;
        });
        if (!kids.length) return;
        const kidMid = kids.reduce((s,c)=>s+cx_of.get(c),0)/kids.length;
        const grpMid = group.length===1
          ? cx_of.get(group[0])
          : (cx_of.get(group[0])+cx_of.get(group[1]))/2;
        const delta = kidMid - grpMid;
        layerIds.forEach(id => cx_of.set(id, cx_of.get(id)+delta));
      });

      // Top-down : centrer les enfants sous leurs parents
      layers[li+1].groups.forEach(group => {
        if (group.includes(mainId)) return;
        const parents = layerIds.filter(p => {
          return group.some(c => (db[c]?.parents||[]).includes(p));
        });
        if (!parents.length) return;
        const parMid = parents.reduce((s,p)=>s+cx_of.get(p),0)/parents.length;
        const grpMid = group.length===1
          ? cx_of.get(group[0])
          : (cx_of.get(group[0])+cx_of.get(group[1]))/2;
        const delta = parMid - grpMid;
        const nextLayerIds = layers[li+1].groups.flat();
        nextLayerIds.forEach(id => cx_of.set(id, cx_of.get(id)+delta));
      });
    }
  }

  // ── Pass 3 : résoudre les chevauchements dans chaque rangée ──────────────
  layers.forEach(layer => {
    // Construire liste de slots triés par cx
    const slots = layer.groups.map(g => {
      const mid = g.length===1 ? cx_of.get(g[0]) : (cx_of.get(g[0])+cx_of.get(g[1]))/2;
      return { g, mid, w: gw(g) };
    }).sort((a,b)=>a.mid-b.mid);

    // Sweep gauche→droite pour garantir l'espacement minimum
    for (let i=1; i<slots.length; i++) {
      const prev=slots[i-1], curr=slots[i];
      const minMid = prev.mid + prev.w/2 + ggap + curr.w/2;
      if (curr.mid < minMid) {
        const delta = minMid - curr.mid;
        for (let j=i; j<slots.length; j++) slots[j].mid += delta;
      }
    }

    // Sweep droite→gauche pour éviter le biais
    for (let i=slots.length-2; i>=0; i--) {
      const curr=slots[i], next=slots[i+1];
      const maxMid = next.mid - next.w/2 - ggap - curr.w/2;
      if (curr.mid > maxMid) {
        const delta = curr.mid - maxMid;
        for (let j=i; j>=0; j--) slots[j].mid -= delta;
      }
    }

    // Ré-affecter les cx depuis les slots triés
    slots.forEach(({g, mid, w}) => {
      if (g.length===1) {
        cx_of.set(g[0], mid);
      } else {
        const x1 = mid - w/2;
        cx_of.set(g[0], x1+cw/2);
        cx_of.set(g[1], x1+cw+cgap+cw/2);
      }
    });
  });

  // ── Étape finale : convertir en coords absolues ────────────────────────────
  let minX=Infinity, maxX=-Infinity;
  const posRaw = new Map();
  layers.forEach((layer,li) => {
    const y = yOf(li);
    layer.groups.flat().forEach(id => {
      const cx = cx_of.get(id);
      const x  = cx - cw/2;
      posRaw.set(id, { x, y, cx, cy: y+ch/2 });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x+cw);
    });
  });

  // Normaliser pour minX = PAD
  const dx = PAD - minX;
  const pos = new Map();
  posRaw.forEach((p,id) => pos.set(id, { x:p.x+dx, y:p.y, cx:p.cx+dx, cy:p.cy }));

  const W = Math.round(maxX-minX) + PAD*2;
  const H = yOf(layers.length-1) + ch + PAD + LEG_ROW_H*4;

  return { pos, W, H };
}

// ─── Connexions ───────────────────────────────────────────────────────────────
function drawLinks(ctx, graph, pos, dims, db) {
  const { cw, ch, scale } = dims;
  const getCol = id => RC[graph.get(id)?.relation||'unknown']||'#64748b';
  const lw = Math.max(.7, scale*1.7);
  const drawn = new Set();

  // Parent→enfant
  for (const [parentId] of graph) {
    const pp = pos.get(parentId); if (!pp) continue;
    const kids = (db[parentId]?.children||[]).filter(c=>graph.has(c)&&pos.get(c));
    if (!kids.length) continue;

    // Grouper les enfants par ensemble de parents communs
    const cg = new Map();
    kids.forEach(cId => {
      const key = (db[cId]?.parents||[]).filter(p=>pos.get(p)&&graph.has(p)).sort().join('|');
      if (!cg.has(key)) cg.set(key, []);
      cg.get(key).push(cId);
    });

    for (const [pKey, groupKids] of cg) {
      const ek = [pKey, ...groupKids.sort()].join('→');
      if (drawn.has(ek)) continue; drawn.add(ek);
      const pIds = pKey.split('|').filter(Boolean);
      const pPos = pIds.map(p=>pos.get(p)).filter(Boolean);
      if (!pPos.length) continue;
      const ox = pPos.reduce((s,p)=>s+p.cx,0)/pPos.length;
      const fy = Math.max(...pPos.map(p=>p.y+ch));
      const lc = getCol(groupKids[0]);

      if (groupKids.length===1) {
        const cp = pos.get(groupKids[0]);
        const bmy = fy+(cp.y-fy)*.42;
        ctx.save();ctx.globalAlpha=.58;ctx.strokeStyle=lc;ctx.lineWidth=lw;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(ox,fy);ctx.bezierCurveTo(ox,bmy,cp.cx,bmy,cp.cx,cp.y);
        ctx.stroke();ctx.restore();
      } else {
        const xs = groupKids.map(c=>pos.get(c).cx);
        const minX=Math.min(...xs), maxX=Math.max(...xs);
        const midY = fy+(pos.get(groupKids[0]).y-fy)*.38;
        seg(ctx,ox,fy,ox,midY,lc,.56,lw,null);
        seg(ctx,minX,midY,maxX,midY,lc,.56,lw,null);
        groupKids.forEach(cId=>{
          const cp=pos.get(cId);if(!cp)return;
          seg(ctx,cp.cx,midY,cp.cx,cp.y,getCol(cId),.56,lw,null);
        });
      }
    }
  }

  // Conjoints
  const dc = new Set();
  for (const [id] of graph) {
    const p = pos.get(id); if (!p) continue;
    const pid = db[id]?.partner;
    if (!pid||!pos.get(pid)) continue;
    const ek = [id,pid].sort().join('♥');
    if (dc.has(ek)) continue; dc.add(ek);
    const pp = pos.get(pid);
    const x1=Math.min(p.x,pp.x)+cw, x2=Math.max(p.x,pp.x);
    if (x2>x1+1) {
      seg(ctx,x1,p.cy,x2,p.cy,COL.heart,.85,lw,[Math.round(scale*4),Math.round(scale*3)]);
      heartDraw(ctx,(x1+x2)/2,p.cy-Math.round(scale*7),Math.round(scale*6),COL.heart);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
async function generateFamilyTree(_, userMap, mainId) {
  const { nodes:graph, layers } = getFamilyLayout(mainId);

  if (!layers.length || graph.size<=1) {
    const c=createCanvas(560,160); const ctx=c.getContext('2d');
    drawBg(ctx,560,160);
    ctx.fillStyle=COL.text;ctx.font='bold 16px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('Aucune famille',280,80);
    return c.toBuffer('image/png');
  }

  const uf = pt.join(__dirname,'..','data','users.json');
  let db={}; try{db=JSON.parse(fs.readFileSync(uf,'utf8'));}catch{}

  // Dimensions adaptatives selon le contenu
  const dims = calcCardSize(layers);
  const { pos, W, H } = buildLayout(layers, mainId, db, dims);
  const { cw, ch, cr, av, scale } = dims;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBg(ctx, W, H);
  drawLinks(ctx, graph, pos, dims, db);

  const draws = [];
  for (const [id, info] of graph) {
    const p = pos.get(id); if (!p) continue;
    const u = userMap[id]||{username:'Inconnu',avatarURL:null,pets:[]};
    const ri = REL_INFO[info.relation]||{label:info.relation,couleur:'#64748b'};
    draws.push(drawCard(ctx,p.x,p.y,cw,ch,cr,av,ri.couleur,
      u.username, id===mainId?null:ri.label, u.avatarURL, id===mainId, u.pets||[], scale));
  }
  await Promise.all(draws);

  const cnt = [...graph.keys()].filter(id=>pos.get(id)).length;
  drawTitle(ctx, W, userMap[mainId]?.username??'???', cnt);
  drawLegend(ctx, W, H, graph);

  return canvas.toBuffer('image/png');
}

module.exports = { generateFamilyTree };
