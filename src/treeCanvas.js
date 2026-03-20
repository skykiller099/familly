/**
 * treeCanvas.js v8 — Layout 100% adaptatif
 *
 * Principe : on calcule d'abord le scale S nécessaire pour tout faire tenir
 * dans MAX_W×MAX_H, puis on dessine directement avec toutes les dimensions
 * multipliées par S. Pas de ctx.scale(), pas de canvas intermédiaire.
 * Résultat : polices et lignes toujours nets, rien ne déborde jamais.
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');
const fs   = require('fs');
const path = require('path');

// ─── Limites de sortie ────────────────────────────────────────────────────────
const MAX_W = 1200;
const MAX_H = 1000;
const MIN_S = 0.30;  // on ne descend jamais en dessous de 30% de la taille base

// ─── Dimensions "base" (à S=1) ───────────────────────────────────────────────
const B = {
  CW: 180, CH: 70, CR: 12,   // carte W/H/radius
  AV: 20,                     // avatar radius
  CGAP: 6,                    // gap intra-couple
  GGAP: 28,                   // gap inter-groupe
  VGAP: 80,                   // gap vertical entre rangées
  PX: 44, PY: 52,             // padding canvas
  TH: 40,                     // hauteur zone titre
  LH: 28,                     // hauteur zone légende (1 ligne)
};

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = {
  bg0:'#060411', bg1:'#0c0818', bg2:'#0f0b20',
  card:'#0d0a1c', text:'#eae4ff', muted:'#3a3060', heart:'#f472b6',
};

// ─── Helpers couleur ──────────────────────────────────────────────────────────
function rgba(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function light(hex,t){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`;
}

// ─── Helpers dessin ───────────────────────────────────────────────────────────
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
function seg(ctx,x1,y1,x2,y2,col,a,lw,dash){
  ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  if(dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}
function heart(ctx,cx,cy,s){
  ctx.save(); ctx.fillStyle=P.heart; ctx.globalAlpha=.95;
  ctx.beginPath();
  ctx.moveTo(cx,cy+s*.35);
  ctx.bezierCurveTo(cx,cy-s*.2,cx-s,cy-s*.2,cx-s,cy+s*.45);
  ctx.bezierCurveTo(cx-s,cy+s,cx,cy+s*1.5,cx,cy+s*1.5);
  ctx.bezierCurveTo(cx,cy+s*1.5,cx+s,cy+s,cx+s,cy+s*.45);
  ctx.bezierCurveTo(cx+s,cy-s*.2,cx,cy-s*.2,cx,cy+s*.35);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
async function drawAv(ctx,url,cx,cy,r,col){
  // Glow
  ctx.save();
  const g=ctx.createRadialGradient(cx,cy,r*.4,cx,cy,r+r*.25);
  g.addColorStop(0,rgba(col,.28)); g.addColorStop(1,rgba(col,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,r+r*.25,0,Math.PI*2); ctx.fill(); ctx.restore();
  // Ring
  ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=Math.max(1,r*.09);
  ctx.beginPath(); ctx.arc(cx,cy,r+1,0,Math.PI*2); ctx.stroke(); ctx.restore();
  // Image
  if(url){
    try{
      const img=await loadImage(url+'?size=64');
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
      ctx.drawImage(img,cx-r,cy-r,r*2,r*2); ctx.restore(); return;
    }catch{}
  }
  // Fallback
  ctx.save();
  const fg=ctx.createRadialGradient(cx-r*.25,cy-r*.25,0,cx,cy,r);
  fg.addColorStop(0,light(col,.28)); fg.addColorStop(1,col);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(r*.82)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('?',cx,cy+.5); ctx.restore();
}

// ─── Pet badges (cercles colorés dans la carte) ───────────────────────────────
const PA={'chien':'D','chat':'C','poisson':'P','serpent':'S','oiseau':'O'};
function petBadges(ctx,pets,x,y,cw,ch,col,s){
  if(!pets||!pets.length) return;
  const br=Math.max(4,Math.round(s*6.5));
  const gap=Math.max(2,Math.round(s*3));
  const total=pets.length*(br*2+gap)-gap;
  let bx=x+cw-total-Math.round(s*6);
  const by=y+ch-br-Math.round(s*5);
  pets.forEach(pet=>{
    ctx.save();
    ctx.fillStyle=rgba(col,.28); ctx.strokeStyle=col; ctx.lineWidth=Math.max(.7,s*.9);
    ctx.beginPath(); ctx.arc(bx+br,by,br,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(br*.9)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(PA[pet.type]||'?',bx+br,by+.5);
    ctx.restore();
    bx+=br*2+gap;
  });
}

// ─── Carte ────────────────────────────────────────────────────────────────────
async function drawCard(ctx,x,y,cw,ch,cr,av,col,name,role,avURL,isMain,pets,s){
  // Glow shadow
  ctx.save(); ctx.shadowColor=rgba(col,isMain?.52:.22); ctx.shadowBlur=Math.round(isMain?18:8);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=P.card; ctx.fill(); ctx.restore();
  // Fond gradient
  const gf=ctx.createLinearGradient(x,y,x+cw,y+ch);
  gf.addColorStop(0,light(col,.08)); gf.addColorStop(1,P.card);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=gf; ctx.fill();
  // Bordure
  ctx.save(); if(isMain){ctx.shadowColor=col;ctx.shadowBlur=Math.round(s*7);}
  rr(ctx,x,y,cw,ch,cr); ctx.strokeStyle=col; ctx.lineWidth=Math.max(.8,isMain?s*2.4:s*1.5);
  ctx.globalAlpha=.88; ctx.stroke(); ctx.restore();
  // Barre top
  ctx.save(); ctx.globalAlpha=.38;
  const bar=ctx.createLinearGradient(x+cr,y,x+cw-cr,y);
  bar.addColorStop(0,'transparent'); bar.addColorStop(.3,col); bar.addColorStop(.7,col); bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar; ctx.fillRect(x+cr,y,cw-cr*2,Math.max(1,s*1.5)); ctx.restore();
  // Avatar
  await drawAv(ctx,avURL||null,x+av+Math.round(s*9),y+ch/2,av,col);
  // Texte — tailles de police proportionnelles à ch
  const nameFontPx = Math.max(8, Math.round(ch*.195));
  const roleFontPx = Math.max(7, Math.round(ch*.148));
  const tx=x+av*2+Math.round(s*13);
  const maxTW=cw-av*2-Math.round(s*16);
  ctx.save();
  ctx.fillStyle=P.text; ctx.textBaseline='middle';
  ctx.font=(isMain?'bold ':'')+`${nameFontPx}px sans-serif`;
  let n=name; while(n.length>1&&ctx.measureText(n).width>maxTW) n=n.slice(0,-1);
  if(n!==name) n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+ch/2-(role?ch*.115:0));
  if(role){
    ctx.fillStyle=rgba(col,.88); ctx.font=`${roleFontPx}px sans-serif`;
    let ro=role; while(ro.length>1&&ctx.measureText(ro).width>maxTW) ro=ro.slice(0,-1);
    if(ro!==role) ro=ro.slice(0,-1)+'..';
    ctx.fillText(ro,tx,y+ch/2+ch*.115);
  }
  ctx.restore();
  // Badges animaux
  petBadges(ctx,pets,x,y,cw,ch,col,s);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CALCUL DU SCALE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Retourne le scale S tel que :
 *   - largeur totale × S ≤ MAX_W
 *   - hauteur totale × S ≤ MAX_H
 *   - S ≥ MIN_S
 *
 * S est calculé à partir de la couche la plus large et du nb de rangées.
 */
function computeScale(layers) {
  // Largeur naturelle d'un groupe
  const gw = g => g.length===1 ? B.CW : B.CW*2+B.CGAP;
  // Largeur naturelle d'une rangée
  const rw = groups => groups.reduce((s,g,i)=>s+gw(g)+(i>0?B.GGAP:0), 0);

  const maxRW = Math.max(...layers.map(l=>rw(l.groups)), 200);
  const naturalW = maxRW + B.PX*2;
  const naturalH = B.PY + B.TH + layers.length*(B.CH+B.VGAP) - B.VGAP + B.PY + B.LH;

  const sx = MAX_W / naturalW;
  const sy = MAX_H / naturalH;
  return Math.max(MIN_S, Math.min(1, sx, sy));
}

// ─────────────────────────────────────────────────────────────────────────────
//  PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Place les cartes en coordonnées canvas finales (déjà × S).
 * Retourne Map<id, {x,y,cx,cy}> + les dimensions W,H du canvas.
 */
function layout(layers, mainId, S) {
  const cw=Math.round(B.CW*S), ch=Math.round(B.CH*S), cgap=Math.round(B.CGAP*S);
  const ggap=Math.round(B.GGAP*S), vgap=Math.round(B.VGAP*S);
  const px=Math.round(B.PX*S), py=Math.round(B.PY*S);
  const th=Math.round(B.TH*S), lh=Math.round(B.LH*S);

  const gw = g => g.length===1 ? cw : cw*2+cgap;
  const rw = groups => groups.reduce((s,g,i)=>s+gw(g)+(i>0?ggap:0), 0);

  const maxRW = Math.max(...layers.map(l=>rw(l.groups)), 200);
  const W = maxRW + px*2;
  const H = py + th + layers.length*(ch+vgap) - vgap + py + lh;

  const pos = new Map();
  const yStart = py + th;

  layers.forEach((layer, li) => {
    const y = yStart + li*(ch+vgap);
    const totalW = rw(layer.groups);

    // Centrage de la rangée sur W
    let startX = (W - totalW) / 2;

    // Si la couche contient mainId → centrer son groupe
    const fgi = layer.groups.findIndex(g=>g.includes(mainId));
    if (fgi >= 0) {
      let pre = 0;
      for(let gi=0;gi<fgi;gi++) pre+=gw(layer.groups[gi])+ggap;
      const focalCx = pre + gw(layer.groups[fgi])/2;
      startX = Math.max(px, W/2 - focalCx);
    }

    let curX = startX;
    layer.groups.forEach(group => {
      if(group.length===1){
        const id=group[0];
        pos.set(id,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
      } else {
        const [id1,id2]=group;
        const x2=curX+cw+cgap;
        pos.set(id1,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
        pos.set(id2,{x:x2,  y,cx:x2+cw/2,  cy:y+ch/2});
      }
      curX+=gw(group)+ggap;
    });
  });

  return { pos, W, H, cw, ch, cr:Math.round(B.CR*S), av:Math.round(B.AV*S),
           py, th, lh, px };
}

// ─── Connexions ───────────────────────────────────────────────────────────────
function drawLinks(ctx, graph, pos, S, cw, ch) {
  const uf = path.join(__dirname,'..','data','users.json');
  let users={}; try{users=JSON.parse(fs.readFileSync(uf,'utf8'));}catch{}
  const u=id=>users[id]||{partner:null,parents:[],children:[]};
  const col=id=>REL_INFO[graph.get(id)?.relation||'unknown']?.couleur||'#7c3aed';
  const drawn=new Set();
  const lw=Math.max(.7,S*1.7);

  for(const [id] of graph){
    const p=pos.get(id); if(!p) continue;
    const node=u(id);

    // Parents
    for(const pId of (node.parents||[])){
      const pp=pos.get(pId); if(!pp) continue;
      const ek=[id,pId].sort().join('|');
      if(drawn.has(ek)) continue; drawn.add(ek);

      const pc=col(pId);
      const co=(node.parents||[]).find(x=>x!==pId&&pos.get(x));
      const cop=co?pos.get(co):null;
      const ox=cop?(pp.cx+cop.cx)/2:pp.cx;
      const fy=pp.y+ch, ty=p.y;
      const my=fy+(ty-fy)*.38;

      const sibs=[...graph.keys()].filter(s=>s!==id&&u(s).parents?.includes(pId)&&pos.get(s));

      if(!sibs.length){
        // Bezier
        ctx.save(); ctx.globalAlpha=.58; ctx.strokeStyle=pc; ctx.lineWidth=lw; ctx.lineCap='round';
        const bmy=(fy+ty)/2;
        ctx.beginPath(); ctx.moveTo(ox,fy); ctx.bezierCurveTo(ox,bmy,p.cx,bmy,p.cx,ty);
        ctx.stroke(); ctx.restore();
      } else {
        const kids=[id,...sibs].filter(x=>pos.get(x));
        const xs=kids.map(x=>pos.get(x).cx);
        seg(ctx,ox,fy,ox,my,pc,.56,lw,null);
        seg(ctx,Math.min(...xs),my,Math.max(...xs),my,pc,.56,lw,null);
        kids.forEach(c=>{const cp=pos.get(c);if(cp)seg(ctx,cp.cx,my,cp.cx,cp.y,col(c),.56,lw,null);});
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
          seg(ctx,x1,p.cy,x2,p.cy,P.heart,.85,lw,[Math.round(S*4),Math.round(S*3)]);
          heart(ctx,(x1+x2)/2,p.cy-Math.round(S*7),Math.round(S*6));
        }
      }
    }
  }
}

// ─── Fond ─────────────────────────────────────────────────────────────────────
function drawBg(ctx,W,H){
  const bg=ctx.createLinearGradient(0,0,W*.5,H);
  bg.addColorStop(0,P.bg0); bg.addColorStop(.5,P.bg1); bg.addColorStop(1,P.bg2);
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  [[.1,.15,.48,'rgba(50,6,110,.15)'],[.9,.8,.3,'rgba(6,34,95,.12)'],[.5,.5,.4,'rgba(16,2,50,.09)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc); n.addColorStop(1,'transparent');
    ctx.fillStyle=n; ctx.fillRect(0,0,W,H);
  });
  const nStars=Math.round(80+W*.05);
  for(let i=0;i<nStars;i++){
    ctx.save(); ctx.globalAlpha=Math.random()*.16+.02; ctx.fillStyle='#c4b5fd';
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*.85+.1,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
}

// ─── Titre ────────────────────────────────────────────────────────────────────
function drawTitle(ctx,W,py,S,name,count){
  const fs1=Math.max(12,Math.round(S*22)), fs2=Math.max(9,Math.round(S*11));
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-150*S,0,W/2+150*S,0);
  tg.addColorStop(0,'#a855f7'); tg.addColorStop(.5,'#ede9fe'); tg.addColorStop(1,'#ec4899');
  ctx.fillStyle=tg; ctx.font=`bold ${fs1}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.shadowColor='rgba(168,85,247,.5)'; ctx.shadowBlur=Math.round(S*10);
  ctx.fillText(`Arbre de ${name}`,W/2,py);
  ctx.restore();
  ctx.save(); ctx.fillStyle=P.muted; ctx.font=`${fs2}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText(`${count} membre${count>1?'s':''}`,W/2,py+fs1+Math.round(S*4));
  ctx.restore();
}

// ─── Légende ──────────────────────────────────────────────────────────────────
function drawLeg(ctx,W,H,lh,S,rels){
  const items=[...rels].filter(r=>r!=='self').map(r=>[r,REL_INFO[r]||REL_INFO.unknown]);
  if(!items.length) return;
  const iW=Math.round(S*115);
  const perRow=Math.max(1,Math.floor((W-Math.round(S*40))/iW));
  const rows=[]; for(let i=0;i<items.length;i+=perRow) rows.push(items.slice(i,i+perRow));
  const legY=H-lh+Math.round(S*4);
  const rH=Math.round(S*15);
  rows.forEach((row,ri)=>{
    const tw=row.length*iW, lx=(W-tw)/2;
    row.forEach(([,info],ci)=>{
      const x=lx+ci*iW, y=legY+ri*rH;
      const dotr=Math.max(2,Math.round(S*4));
      ctx.save(); ctx.fillStyle=info.couleur; ctx.globalAlpha=.88;
      ctx.beginPath(); ctx.arc(x+dotr,y,dotr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#5a4e7a'; ctx.font=`${Math.max(8,Math.round(S*10))}px sans-serif`;
      ctx.textBaseline='middle'; ctx.globalAlpha=.78;
      ctx.fillText(info.label,x+dotr*2+Math.round(S*2),y);
      ctx.restore();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  POINT D'ENTRÉE
// ─────────────────────────────────────────────────────────────────────────────
async function generateFamilyTree(_unused, userMap, mainId){
  const { nodes:graph, layers } = getFamilyLayout(mainId);

  // Arbre vide
  if(!layers.length || graph.size<=1){
    const c=createCanvas(600,180); const ctx=c.getContext('2d');
    drawBg(ctx,600,180);
    ctx.fillStyle=P.text; ctx.font='bold 17px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Aucune famille',300,90);
    return c.toBuffer('image/png');
  }

  // ── Scale ────────────────────────────────────────────────────────────────
  const S = computeScale(layers);

  // ── Layout ───────────────────────────────────────────────────────────────
  const { pos, W, H, cw, ch, cr, av, py, th, lh } = layout(layers, mainId, S);

  // ── Canvas ───────────────────────────────────────────────────────────────
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fond ─────────────────────────────────────────────────────────────────
  drawBg(ctx, W, H);

  // ── Connexions ────────────────────────────────────────────────────────────
  drawLinks(ctx, graph, pos, S, cw, ch);

  // ── Cartes ────────────────────────────────────────────────────────────────
  const draws = [];
  for(const [id,info] of graph){
    const p=pos.get(id); if(!p) continue;
    const u=userMap[id]||{username:'Inconnu',avatarURL:null,pets:[]};
    const ri=REL_INFO[info.relation]||REL_INFO.unknown;
    draws.push(drawCard(ctx,p.x,p.y,cw,ch,cr,av,ri.couleur,
      u.username, id===mainId?null:ri.label,
      u.avatarURL, id===mainId, u.pets||[], S));
  }
  await Promise.all(draws);

  // ── Titre ─────────────────────────────────────────────────────────────────
  const mName=userMap[mainId]?.username??'???';
  const memberCount=[...graph.keys()].filter(id=>pos.get(id)).length;
  drawTitle(ctx,W,py,S,mName,memberCount);

  // ── Légende ───────────────────────────────────────────────────────────────
  const rels=new Set([...graph.values()].map(n=>n.relation));
  drawLeg(ctx,W,H,lh,S,rels);

  return canvas.toBuffer('image/png');
}

module.exports = { generateFamilyTree };
