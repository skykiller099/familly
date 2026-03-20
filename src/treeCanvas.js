/**
 * treeCanvas.js — v9
 *
 * Le bug précédent : W = max(rowWidth) + padding, mais le centrage du
 * groupe focal décale les rangées vers la droite → débordement.
 *
 * Fix : on calcule d'abord les positions de TOUTES les rangées (avec
 * centrage focal), on mesure la bounding box réelle, PUIS on crée le
 * canvas à cette taille exacte.
 *
 * Pipeline :
 *   1. getFamilyLayout → layers
 *   2. computeScale(layers) → S
 *   3. rawPositions(layers, S) → positions brutes + bbox
 *   4. normalise(bbox) → décale tout pour que minX=PAD_X
 *   5. createCanvas(W, H) → dessine
 */

'use strict';
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');
const fs   = require('fs');
const path = require('path');

// ─── Limites ──────────────────────────────────────────────────────────────────
const MAX_W  = 1200;
const MAX_H  = 980;
const MIN_S  = 0.28;

// ─── Dimensions base (S=1) ────────────────────────────────────────────────────
const B = {
  CW: 174, CH: 68, CR: 11,
  AV: 19,
  CGAP: 6,    // gap entre les 2 cartes d'un couple
  GGAP: 26,   // gap entre groupes distincts
  VGAP: 78,   // gap vertical entre rangées
  PAD: 44,    // padding uniforme autour du contenu
  TITLE: 42,  // hauteur zone titre
  LEG: 26,    // hauteur zone légende (par ligne)
};

// ─── Palette ──────────────────────────────────────────────────────────────────
const COL = {
  bg0:'#060411', bg1:'#0a0716', bg2:'#0e0b1e',
  card:'#0c091a', text:'#eae4ff', muted:'#37305a', heart:'#f472b6',
};

// ─── Couleurs util ────────────────────────────────────────────────────────────
const h2r = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const rgba = (h,a) => { const [r,g,b]=h2r(h); return `rgba(${r},${g},${b},${a})`; };
const lite = (h,t) => { const [r,g,b]=h2r(h); return `rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`; };

// ─── Helpers canvas ───────────────────────────────────────────────────────────
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
const seg = (ctx,x1,y1,x2,y2,col,a,lw,dash) => {
  ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  if(dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
};
const heartPath = (ctx,cx,cy,s) => {
  ctx.beginPath();
  ctx.moveTo(cx,cy+s*.35);
  ctx.bezierCurveTo(cx,cy-s*.2,cx-s,cy-s*.2,cx-s,cy+s*.45);
  ctx.bezierCurveTo(cx-s,cy+s,cx,cy+s*1.5,cx,cy+s*1.5);
  ctx.bezierCurveTo(cx,cy+s*1.5,cx+s,cy+s,cx+s,cy+s*.45);
  ctx.bezierCurveTo(cx+s,cy-s*.2,cx,cy-s*.2,cx,cy+s*.35);
  ctx.closePath();
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
async function drawAv(ctx,url,cx,cy,r,col){
  ctx.save();
  const gl=ctx.createRadialGradient(cx,cy,r*.4,cx,cy,r+r*.22);
  gl.addColorStop(0,rgba(col,.28)); gl.addColorStop(1,rgba(col,0));
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,cy,r+r*.22,0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=Math.max(1,r*.09);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
  if(url){
    try{
      const img=await loadImage(url+'?size=64');
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
      ctx.drawImage(img,cx-r,cy-r,r*2,r*2); ctx.restore(); return;
    }catch{}
  }
  ctx.save();
  const fg=ctx.createRadialGradient(cx-r*.25,cy-r*.25,0,cx,cy,r);
  fg.addColorStop(0,lite(col,.28)); fg.addColorStop(1,col);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(r*.8)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('?',cx,cy+.5); ctx.restore();
}

// ─── Pet badges (cercles en bas-droite de la carte) ───────────────────────────
const PABB={chien:'D',chat:'C',poisson:'P',serpent:'S',oiseau:'O'};
function petBadges(ctx,pets,x,y,cw,ch,col,S){
  if(!pets||!pets.length) return;
  const br=Math.max(4,Math.round(S*6)), gap=Math.max(2,Math.round(S*3));
  let bx=x+cw-(pets.length*(br*2+gap)-gap)-Math.round(S*5);
  const by=y+ch-br-Math.round(S*5);
  pets.forEach(pet=>{
    ctx.save();
    ctx.fillStyle=rgba(col,.3); ctx.strokeStyle=col; ctx.lineWidth=Math.max(.6,S*.8);
    ctx.beginPath(); ctx.arc(bx+br,by,br,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(br*.88)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(PABB[pet.type]||'?',bx+br,by+.5);
    ctx.restore();
    bx+=br*2+gap;
  });
}

// ─── Carte ────────────────────────────────────────────────────────────────────
async function drawCard(ctx,x,y,cw,ch,cr,av,col,name,role,avURL,isMain,pets,S){
  ctx.save(); ctx.shadowColor=rgba(col,isMain?.5:.22); ctx.shadowBlur=Math.round(isMain?17:8);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=COL.card; ctx.fill(); ctx.restore();
  const gf=ctx.createLinearGradient(x,y,x+cw,y+ch);
  gf.addColorStop(0,lite(col,.08)); gf.addColorStop(1,COL.card);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=gf; ctx.fill();
  ctx.save(); if(isMain){ctx.shadowColor=col;ctx.shadowBlur=Math.round(S*7);}
  rr(ctx,x,y,cw,ch,cr); ctx.strokeStyle=col; ctx.lineWidth=Math.max(.8,isMain?S*2.3:S*1.5);
  ctx.globalAlpha=.88; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalAlpha=.38;
  const bar=ctx.createLinearGradient(x+cr,y,x+cw-cr,y);
  bar.addColorStop(0,'transparent'); bar.addColorStop(.32,col); bar.addColorStop(.68,col); bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar; ctx.fillRect(x+cr,y,cw-cr*2,Math.max(1,S*1.5)); ctx.restore();
  await drawAv(ctx,avURL||null,x+av+Math.round(S*8),y+ch/2,av,col);
  const tx=x+av*2+Math.round(S*12), maxTW=cw-av*2-Math.round(S*14);
  const nfs=Math.max(8,Math.round(ch*.195)), rfs=Math.max(7,Math.round(ch*.148));
  ctx.save();
  ctx.fillStyle=COL.text; ctx.textBaseline='middle'; ctx.font=(isMain?'bold ':'')+`${nfs}px sans-serif`;
  let n=name; while(n.length>1&&ctx.measureText(n).width>maxTW) n=n.slice(0,-1);
  if(n!==name) n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+ch/2-(role?ch*.115:0));
  if(role){
    ctx.fillStyle=rgba(col,.88); ctx.font=`${rfs}px sans-serif`;
    let ro=role; while(ro.length>1&&ctx.measureText(ro).width>maxTW) ro=ro.slice(0,-1);
    if(ro!==role) ro=ro.slice(0,-1)+'..';
    ctx.fillText(ro,tx,y+ch/2+ch*.115);
  }
  ctx.restore();
  petBadges(ctx,pets,x,y,cw,ch,col,S);
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1 : Calcul du scale
//  On fait une passe "dry-run" du layout pour connaître la bbox,
//  puis on calcule S = min(MAX_W/bboxW, MAX_H/bboxH).
//  On itère jusqu'à convergence (2 passes suffisent en pratique).
// ─────────────────────────────────────────────────────────────────────────────

/** Largeur d'un groupe en px scalés */
const gw = (g,cw,cgap) => g.length===1 ? cw : cw*2+cgap;

/**
 * Calcule les positions X,Y brutes (centre de chaque carte) pour tous les ids.
 * Le référentiel est ancré sur le groupe focal centré à x=0.
 * Retourne Map<id, {x,y,cx,cy}> + bbox {minX,maxX,minY,maxY}.
 */
function rawLayout(layers, mainId, S) {
  const cw  = Math.round(B.CW*S);
  const ch  = Math.round(B.CH*S);
  const cgap= Math.round(B.CGAP*S);
  const ggap= Math.round(B.GGAP*S);
  const vgap= Math.round(B.VGAP*S);
  const th  = Math.round(B.TITLE*S);

  const pos = new Map();
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;

  // Y de chaque rangée
  const yOf = li => th + li*(ch+vgap);

  layers.forEach((layer, li) => {
    const y = yOf(li);
    const totalLayerW = layer.groups.reduce((s,g,i)=>s+gw(g,cw,cgap)+(i>0?ggap:0),0);

    // Trouver le groupe focal (contient mainId)
    const fgi = layer.groups.findIndex(g=>g.includes(mainId));

    // Calculer startX pour que le cx du groupe focal soit à 0
    // Si pas de groupe focal : centrer la rangée
    let startX;
    if(fgi>=0){
      // Largeur des groupes avant le focal
      let preW=0; for(let gi=0;gi<fgi;gi++) preW+=gw(layer.groups[gi],cw,cgap)+ggap;
      // cx du focal si startX=0
      const focalCx = preW + gw(layer.groups[fgi],cw,cgap)/2;
      // On veut focalCx à X=0
      startX = -focalCx;
    } else {
      startX = -totalLayerW/2;
    }

    let curX=startX;
    layer.groups.forEach(group=>{
      if(group.length===1){
        const id=group[0];
        pos.set(id,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
        minX=Math.min(minX,curX); maxX=Math.max(maxX,curX+cw);
      } else {
        const [id1,id2]=group;
        const x2=curX+cw+cgap;
        pos.set(id1,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
        pos.set(id2,{x:x2,  y,cx:x2+cw/2,  cy:y+ch/2});
        minX=Math.min(minX,curX); maxX=Math.max(maxX,x2+cw);
      }
      curX+=gw(group,cw,cgap)+ggap;
    });
    minY=Math.min(minY,y); maxY=Math.max(maxY,y+ch);
  });

  return { pos, bbox:{minX,maxX,minY,maxY}, cw,ch,cgap,ggap,vgap,th };
}

/**
 * Calcule le scale optimal en 2 passes.
 * Passe 1 : S=1 → bbox → scale
 * Passe 2 : vérification (le scale peut changer légèrement la bbox à cause des arrondis)
 */
function computeOptimalScale(layers, mainId) {
  function tryScale(S) {
    const { bbox } = rawLayout(layers, mainId, S);
    const pad = Math.round(B.PAD*S);
    const legH = Math.round(B.LEG*S) * estimateLegRows(layers);
    const contentW = (bbox.maxX - bbox.minX) + pad*2;
    const contentH = (bbox.maxY - bbox.minY) + Math.round(B.TITLE*S) + pad*2 + legH;
    return { contentW, contentH };
  }

  const { contentW:w1, contentH:h1 } = tryScale(1);
  let S = Math.max(MIN_S, Math.min(1, MAX_W/w1, MAX_H/h1));

  // 2e passe pour affiner
  const { contentW:w2, contentH:h2 } = tryScale(S);
  S = Math.max(MIN_S, Math.min(1, S * Math.min(MAX_W/w2, MAX_H/h2)));
  S = Math.max(MIN_S, Math.min(1, S));

  return S;
}

function estimateLegRows(layers) {
  const rels = new Set();
  for(const l of layers) for(const g of l.groups) {
    // On n'a pas graph ici, on estime ~1 ligne de légende
  }
  return 1; // conservateur
}

/**
 * Layout final : rawLayout + décalage pour que minX = PAD et minY = PAD+TH.
 * Retourne Map<id,{x,y,cx,cy}> + W,H du canvas.
 */
function finalLayout(layers, mainId, S) {
  const pad  = Math.round(B.PAD*S);
  const th   = Math.round(B.TITLE*S);
  const legH = Math.round(B.LEG*S)*3; // on réserve 3 lignes de légende max

  const { pos, bbox, cw, ch, cgap, ggap, vgap } = rawLayout(layers, mainId, S);

  // Offset pour ramener minX au padding
  const dx = pad - bbox.minX;
  const dy = pad; // les y commencent déjà à th dans rawLayout

  // Appliquer le décalage
  const final = new Map();
  pos.forEach((p,id)=>{
    final.set(id,{
      x:  p.x  + dx,
      y:  p.y  + dy,
      cx: p.cx + dx,
      cy: p.cy + dy,
    });
  });

  const W = Math.round(bbox.maxX - bbox.minX) + pad*2;
  const H = Math.round(bbox.maxY - bbox.minY) + pad*2 + th + legH;

  return { pos:final, W, H, cw, ch, cgap, ggap, vgap, pad, th, legH, S };
}

// ─── Connexions ───────────────────────────────────────────────────────────────
function drawLinks(ctx, graph, pos, S, cw, ch) {
  const uf=path.join(__dirname,'..','data','users.json');
  let users={}; try{users=JSON.parse(fs.readFileSync(uf,'utf8'));}catch{}
  const u=id=>users[id]||{partner:null,parents:[],children:[]};
  const getCol=id=>REL_INFO[graph.get(id)?.relation||'unknown']?.couleur||'#7c3aed';
  const drawn=new Set();
  const lw=Math.max(.7,S*1.7);

  for(const [id] of graph){
    const p=pos.get(id); if(!p) continue;
    const node=u(id);

    // Liens parents
    for(const pId of (node.parents||[])){
      const pp=pos.get(pId); if(!pp) continue;
      const ek=[id,pId].sort().join('|');
      if(drawn.has(ek)) continue; drawn.add(ek);

      const pc=getCol(pId);
      const co=(node.parents||[]).find(x=>x!==pId&&pos.get(x));
      const cop=co?pos.get(co):null;
      const ox=cop?(pp.cx+cop.cx)/2:pp.cx;
      const fy=pp.y+ch, ty=p.y, my=fy+(ty-fy)*.38;

      const sibs=[...graph.keys()].filter(s=>s!==id&&u(s).parents?.includes(pId)&&pos.get(s));

      if(!sibs.length){
        const bmy=(fy+ty)/2;
        ctx.save(); ctx.globalAlpha=.58; ctx.strokeStyle=pc; ctx.lineWidth=lw; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(ox,fy); ctx.bezierCurveTo(ox,bmy,p.cx,bmy,p.cx,ty);
        ctx.stroke(); ctx.restore();
      } else {
        const kids=[id,...sibs].filter(x=>pos.get(x));
        const xs=kids.map(x=>pos.get(x).cx);
        seg(ctx,ox,fy,ox,my,pc,.56,lw,null);
        seg(ctx,Math.min(...xs),my,Math.max(...xs),my,pc,.56,lw,null);
        kids.forEach(c=>{const cp=pos.get(c);if(cp)seg(ctx,cp.cx,my,cp.cx,cp.y,getCol(c),.56,lw,null);});
      }
    }

    // Conjoint
    if(node.partner&&pos.get(node.partner)){
      const ek=[id,node.partner].sort().join('|♥|');
      if(!drawn.has(ek)){
        drawn.add(ek);
        const pp=pos.get(node.partner);
        const x1=Math.min(p.x,pp.x)+cw, x2=Math.max(p.x,pp.x);
        if(x2>x1+1){
          seg(ctx,x1,p.cy,x2,p.cy,COL.heart,.85,lw,[Math.round(S*4),Math.round(S*3)]);
          ctx.save(); ctx.fillStyle=COL.heart; ctx.globalAlpha=.95;
          heartPath(ctx,(x1+x2)/2,p.cy-Math.round(S*7),Math.round(S*6));
          ctx.fill(); ctx.restore();
        }
      }
    }
  }
}

// ─── Fond étoilé ──────────────────────────────────────────────────────────────
function drawBg(ctx,W,H){
  const bg=ctx.createLinearGradient(0,0,W*.5,H);
  bg.addColorStop(0,COL.bg0); bg.addColorStop(.5,COL.bg1); bg.addColorStop(1,COL.bg2);
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  [[.1,.15,.48,'rgba(48,5,105,.15)'],[.9,.8,.3,'rgba(5,32,90,.12)'],[.5,.5,.4,'rgba(14,2,48,.1)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc); n.addColorStop(1,'transparent');
    ctx.fillStyle=n; ctx.fillRect(0,0,W,H);
  });
  for(let i=0;i<Math.min(140,Math.round(W*.1));i++){
    ctx.save(); ctx.globalAlpha=Math.random()*.16+.02; ctx.fillStyle='#c4b5fd';
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*.8+.1,0,Math.PI*2);
    ctx.fill(); ctx.restore();
  }
}

// ─── Titre ────────────────────────────────────────────────────────────────────
function drawTitle(ctx,W,S,name,count){
  const pad=Math.round(B.PAD*S), th=Math.round(B.TITLE*S);
  const fs1=Math.max(12,Math.round(S*21)), fs2=Math.max(9,Math.round(S*10));
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-Math.round(S*140),0,W/2+Math.round(S*140),0);
  tg.addColorStop(0,'#a855f7'); tg.addColorStop(.5,'#ede9fe'); tg.addColorStop(1,'#ec4899');
  ctx.fillStyle=tg; ctx.font=`bold ${fs1}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.shadowColor='rgba(168,85,247,.5)'; ctx.shadowBlur=Math.round(S*9);
  ctx.fillText(`Arbre de ${name}`,W/2,pad);
  ctx.restore();
  ctx.save(); ctx.fillStyle=COL.muted; ctx.font=`${fs2}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText(`${count} membre${count>1?'s':''}`,W/2,pad+fs1+Math.round(S*3));
  ctx.restore();
}

// ─── Légende ──────────────────────────────────────────────────────────────────
function drawLegend(ctx,W,H,legH,S,graph){
  const rels=[...new Set([...graph.values()].map(n=>n.relation))].filter(r=>r!=='self');
  if(!rels.length) return;
  const items=rels.map(r=>[r,REL_INFO[r]||REL_INFO.unknown]);
  const iW=Math.round(S*110), perRow=Math.max(1,Math.floor((W-Math.round(S*60))/iW));
  const rows=[]; for(let i=0;i<items.length;i+=perRow) rows.push(items.slice(i,i+perRow));
  const legY=H-legH+Math.round(S*3);
  const rowH=Math.round(S*14);
  rows.forEach((row,ri)=>{
    const tw=row.length*iW, lx=(W-tw)/2;
    row.forEach(([,info],ci)=>{
      const x=lx+ci*iW, y=legY+ri*rowH;
      const dr=Math.max(2,Math.round(S*3.5));
      ctx.save(); ctx.fillStyle=info.couleur; ctx.globalAlpha=.88;
      ctx.beginPath(); ctx.arc(x+dr,y,dr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#584e7a'; ctx.font=`${Math.max(8,Math.round(S*9.5))}px sans-serif`;
      ctx.textBaseline='middle'; ctx.globalAlpha=.78;
      ctx.fillText(info.label,x+dr*2+Math.round(S*2),y);
      ctx.restore();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────────────────────────────────────
async function generateFamilyTree(_unused, userMap, mainId){
  // Layout BFS
  const { nodes:graph, layers } = getFamilyLayout(mainId);

  // Arbre vide
  if(!layers.length||graph.size<=1){
    const c=createCanvas(560,160); const ctx=c.getContext('2d');
    drawBg(ctx,560,160);
    ctx.fillStyle=COL.text; ctx.font='bold 16px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Aucune famille enregistree',280,80);
    return c.toBuffer('image/png');
  }

  // Scale optimal
  const S = computeOptimalScale(layers, mainId);

  // Positions finales
  const { pos, W, H, cw, ch, S:_, ...rest } = finalLayout(layers, mainId, S);
  const legH = rest.legH;

  // Canvas
  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');

  // Fond
  drawBg(ctx,W,H);

  // Connexions
  drawLinks(ctx,graph,pos,S,cw,ch);

  // Cartes
  const cr=Math.round(B.CR*S), av=Math.round(B.AV*S);
  const draws=[];
  for(const [id,info] of graph){
    const p=pos.get(id); if(!p) continue;
    const u=userMap[id]||{username:'Inconnu',avatarURL:null,pets:[]};
    const ri=REL_INFO[info.relation]||REL_INFO.unknown;
    draws.push(drawCard(ctx,p.x,p.y,cw,ch,cr,av,ri.couleur,
      u.username,id===mainId?null:ri.label,
      u.avatarURL,id===mainId,u.pets||[],S));
  }
  await Promise.all(draws);

  // Titre
  const memberCount=[...graph.keys()].filter(id=>pos.get(id)).length;
  drawTitle(ctx,W,S,userMap[mainId]?.username??'???',memberCount);

  // Légende
  drawLegend(ctx,W,H,legH,S,graph);

  return canvas.toBuffer('image/png');
}

module.exports = { generateFamilyTree };
