/**
 * treeCanvas.js — v10
 *
 * Fix principal : les connexions parent→enfant partent du MILIEU ENTRE
 * LES DEUX PARENTS (calculé depuis leurs positions réelles), et fromY
 * est le bas de la rangée parente (pas le bas d'une carte spécifique).
 * 
 * Une seule connexion est dessinée par groupe de parents (pas une par parent),
 * ce qui évite les doublons et les courbes en S.
 *
 * Nouveau design : couleurs plus douces, cartes plus modernes.
 */

'use strict';
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');
const fsys = require('fs');
const pt   = require('path');

const MAX_W = 1200, MAX_H = 980, MIN_S = 0.28;

const B = {
  CW:174, CH:68, CR:11, AV:19,
  CGAP:6, GGAP:26, VGAP:80,
  PAD:46, TITLE:44, LEG:26,
};

// Palette raffinée
const COL = {
  bg0:'#050310', bg1:'#09061a', bg2:'#0d0a20',
  card:'#0b0818', text:'#ede8ff', muted:'#352e55', heart:'#f472b6',
};

// Relations → couleurs harmonieuses
const REL_COLORS = {
  self:               '#c084fc',  // violet clair
  conjoint:           '#f472b6',  // rose
  parent:             '#60a5fa',  // bleu
  conjointDeParent:   '#818cf8',  // indigo
  enfant:             '#34d399',  // vert émeraude
  conjointDenfant:    '#6ee7b7',
  fratrie:            '#fbbf24',  // ambre
  conjointDeFratrie:  '#fde68a',
  grandParent:        '#38bdf8',  // bleu ciel
  conjointGP:         '#7dd3fc',
  arriereGrandParent: '#bae6fd',
  petitEnfant:        '#10b981',
  arrierePetitEnfant: '#6ee7b7',
  oncleTante:         '#f97316',  // orange
  conjointDoncle:     '#fdba74',
  grandOncleTante:    '#fed7aa',
  neveuNiece:         '#f59e0b',
  petitNeveuNiece:    '#fcd34d',
  cousin:             '#e879f9',  // fuchsia
  unknown:            '#64748b',
};

// Patch REL_INFO couleurs
Object.entries(REL_COLORS).forEach(([k,v])=>{
  if(REL_INFO[k]) REL_INFO[k].couleur=v;
});

const h2r = h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const rgba = (h,a)=>{ const[r,g,b]=h2r(h); return`rgba(${r},${g},${b},${a})`; };
const lite = (h,t)=>{ const[r,g,b]=h2r(h); return`rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`; };

// ─── Helpers dessin ───────────────────────────────────────────────────────────
function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}
function seg(ctx,x1,y1,x2,y2,col,alpha,lw,dash){
  ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=col;
  ctx.lineWidth=lw; ctx.lineCap='round';
  if(dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}
function heartDraw(ctx,cx,cy,s,col){
  ctx.save(); ctx.fillStyle=col; ctx.globalAlpha=.95;
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
  ctx.save();
  const gl=ctx.createRadialGradient(cx,cy,r*.35,cx,cy,r+r*.2);
  gl.addColorStop(0,rgba(col,.3)); gl.addColorStop(1,rgba(col,0));
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,cy,r+r*.2,0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=Math.max(.8,r*.09);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
  if(url){
    try{
      const img=await loadImage(url+'?size=64');
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
      ctx.drawImage(img,cx-r,cy-r,r*2,r*2); ctx.restore(); return;
    }catch{}
  }
  ctx.save();
  const fg=ctx.createRadialGradient(cx-r*.22,cy-r*.22,0,cx,cy,r);
  fg.addColorStop(0,lite(col,.3)); fg.addColorStop(1,col);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(r*.8)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('?',cx,cy+.5); ctx.restore();
}

// ─── Pet badges ───────────────────────────────────────────────────────────────
const PA={chien:'D',chat:'C',poisson:'P',serpent:'S',oiseau:'O'};
function petBadges(ctx,pets,x,y,cw,ch,col,S){
  if(!pets||!pets.length) return;
  const br=Math.max(4,Math.round(S*6.5)), gap=Math.max(2,Math.round(S*3));
  let bx=x+cw-(pets.length*(br*2+gap)-gap)-Math.round(S*6);
  const by=y+ch-br-Math.round(S*5);
  pets.forEach(pet=>{
    ctx.save();
    ctx.fillStyle=rgba(col,.28); ctx.strokeStyle=rgba(col,.8); ctx.lineWidth=Math.max(.6,S*.8);
    ctx.beginPath(); ctx.arc(bx+br,by,br,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(br*.85)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(PA[pet.type]||'?',bx+br,by+.5);
    ctx.restore(); bx+=br*2+gap;
  });
}

// ─── Carte ────────────────────────────────────────────────────────────────────
async function drawCard(ctx,x,y,cw,ch,cr,av,col,name,role,avURL,isMain,pets,S){
  // Glow
  ctx.save(); ctx.shadowColor=rgba(col,isMain?.55:.22); ctx.shadowBlur=Math.round(isMain?20:9);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=COL.card; ctx.fill(); ctx.restore();
  // Fond
  const gf=ctx.createLinearGradient(x,y,x+cw,y+ch);
  gf.addColorStop(0,lite(col,.09)); gf.addColorStop(1,COL.card);
  rr(ctx,x,y,cw,ch,cr); ctx.fillStyle=gf; ctx.fill();
  // Bordure
  ctx.save(); if(isMain){ctx.shadowColor=rgba(col,.6);ctx.shadowBlur=Math.round(S*8);}
  rr(ctx,x,y,cw,ch,cr); ctx.strokeStyle=col;
  ctx.lineWidth=Math.max(.8,isMain?S*2.3:S*1.5); ctx.globalAlpha=.88; ctx.stroke(); ctx.restore();
  // Barre top
  ctx.save(); ctx.globalAlpha=.38;
  const bar=ctx.createLinearGradient(x+cr,y,x+cw-cr,y);
  bar.addColorStop(0,'transparent'); bar.addColorStop(.3,col); bar.addColorStop(.7,col); bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar; ctx.fillRect(x+cr,y,cw-cr*2,Math.max(1,S*1.5)); ctx.restore();
  // Avatar
  await drawAv(ctx,avURL||null,x+av+Math.round(S*8),y+ch/2,av,col);
  // Texte
  const tx=x+av*2+Math.round(S*12), maxTW=cw-av*2-Math.round(S*15);
  const nfs=Math.max(8,Math.round(ch*.195)), rfs=Math.max(7,Math.round(ch*.148));
  ctx.save(); ctx.fillStyle=COL.text; ctx.textBaseline='middle';
  ctx.font=(isMain?'bold ':'')+`${nfs}px sans-serif`;
  let n=name; while(n.length>1&&ctx.measureText(n).width>maxTW) n=n.slice(0,-1);
  if(n!==name) n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+ch/2-(role?ch*.115:0));
  if(role){
    ctx.fillStyle=rgba(col,.9); ctx.font=`${rfs}px sans-serif`;
    let ro=role; while(ro.length>1&&ctx.measureText(ro).width>maxTW) ro=ro.slice(0,-1);
    if(ro!==role) ro=ro.slice(0,-1)+'..';
    ctx.fillText(ro,tx,y+ch/2+ch*.115);
  }
  ctx.restore();
  petBadges(ctx,pets,x,y,cw,ch,col,S);
}

// ─── Fond ─────────────────────────────────────────────────────────────────────
function drawBg(ctx,W,H){
  const bg=ctx.createLinearGradient(0,0,W*.55,H);
  bg.addColorStop(0,COL.bg0); bg.addColorStop(.5,COL.bg1); bg.addColorStop(1,COL.bg2);
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  [[.1,.14,.5,'rgba(44,4,98,.16)'],[.88,.82,.28,'rgba(4,28,88,.13)'],[.5,.5,.38,'rgba(12,1,44,.1)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc); n.addColorStop(1,'transparent'); ctx.fillStyle=n; ctx.fillRect(0,0,W,H);
  });
  const ns=Math.min(160,Math.round(W*.12));
  for(let i=0;i<ns;i++){
    ctx.save(); ctx.globalAlpha=Math.random()*.15+.02; ctx.fillStyle='#c4b5fd';
    ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,Math.random()*.75+.1,0,Math.PI*2);
    ctx.fill(); ctx.restore();
  }
}

// ─── Titre ────────────────────────────────────────────────────────────────────
function drawTitle(ctx,W,S,name,count,pad){
  const fs1=Math.max(13,Math.round(S*22)), fs2=Math.max(9,Math.round(S*10));
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-Math.round(S*150),0,W/2+Math.round(S*150),0);
  tg.addColorStop(0,'#a855f7'); tg.addColorStop(.5,'#ede9fe'); tg.addColorStop(1,'#ec4899');
  ctx.fillStyle=tg; ctx.font=`bold ${fs1}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.shadowColor='rgba(168,85,247,.5)'; ctx.shadowBlur=Math.round(S*9);
  ctx.fillText(`Arbre de ${name}`,W/2,pad); ctx.restore();
  ctx.save(); ctx.fillStyle=COL.muted; ctx.font=`${fs2}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText(`${count} membre${count>1?'s':''}`,W/2,pad+fs1+Math.round(S*3)); ctx.restore();
}

// ─── Légende ──────────────────────────────────────────────────────────────────
function drawLegend(ctx,W,H,S,graph){
  const rels=[...new Set([...graph.values()].map(n=>n.relation))].filter(r=>r!=='self');
  const items=rels.map(r=>[r,REL_INFO[r]||{label:r,couleur:'#64748b'}]);
  if(!items.length) return;
  const iW=Math.round(S*112), perRow=Math.max(1,Math.floor((W-Math.round(S*60))/iW));
  const rows=[]; for(let i=0;i<items.length;i+=perRow) rows.push(items.slice(i,i+perRow));
  const totalLegH = rows.length*Math.round(S*14)+Math.round(S*6);
  const legY=H-totalLegH-Math.round(S*4);
  const rowH=Math.round(S*14);
  rows.forEach((row,ri)=>{
    const tw=row.length*iW, lx=(W-tw)/2, y=legY+ri*rowH;
    row.forEach(([,info],ci)=>{
      const x=lx+ci*iW, dr=Math.max(2,Math.round(S*3.8));
      ctx.save(); ctx.fillStyle=info.couleur; ctx.globalAlpha=.9;
      ctx.beginPath(); ctx.arc(x+dr,y,dr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#584e7a'; ctx.font=`${Math.max(8,Math.round(S*9.5))}px sans-serif`;
      ctx.textBaseline='middle'; ctx.globalAlpha=.78;
      ctx.fillText(info.label,x+dr*2+Math.round(S*2),y); ctx.restore();
    });
  });
  return totalLegH;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LAYOUT : bbox-first, jamais de débordement
// ─────────────────────────────────────────────────────────────────────────────
const gw = (g,cw,cgap) => g.length===1?cw:cw*2+cgap;

function rawLayout(layers, mainId, S){
  const cw=Math.round(B.CW*S), ch=Math.round(B.CH*S);
  const cgap=Math.round(B.CGAP*S), ggap=Math.round(B.GGAP*S), vgap=Math.round(B.VGAP*S);
  const th=Math.round(B.TITLE*S);
  const pos=new Map();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;

  layers.forEach((layer,li)=>{
    const y=th+li*(ch+vgap);
    const totalW=layer.groups.reduce((s,g,i)=>s+gw(g,cw,cgap)+(i>0?ggap:0),0);
    const fgi=layer.groups.findIndex(g=>g.includes(mainId));
    let startX;
    if(fgi>=0){
      let pre=0; for(let gi=0;gi<fgi;gi++) pre+=gw(layer.groups[gi],cw,cgap)+ggap;
      startX=-(pre+gw(layer.groups[fgi],cw,cgap)/2); // focal centré à x=0
    } else {
      startX=-totalW/2;
    }
    let curX=startX;
    layer.groups.forEach(group=>{
      if(group.length===1){
        const id=group[0];
        pos.set(id,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
        minX=Math.min(minX,curX); maxX=Math.max(maxX,curX+cw);
      } else {
        const[id1,id2]=group;
        const x2=curX+cw+cgap;
        pos.set(id1,{x:curX,y,cx:curX+cw/2,cy:y+ch/2});
        pos.set(id2,{x:x2,y,cx:x2+cw/2,cy:y+ch/2});
        minX=Math.min(minX,curX); maxX=Math.max(maxX,x2+cw);
      }
      curX+=gw(group,cw,cgap)+ggap;
    });
    minY=Math.min(minY,y); maxY=Math.max(maxY,y+ch);
  });
  return{pos,bbox:{minX,maxX,minY,maxY},cw,ch,cgap,ggap,vgap,th};
}

function computeScale(layers,mainId){
  function bbox(S){
    const{bbox:b}=rawLayout(layers,mainId,S);
    const pad=Math.round(B.PAD*S), leg=Math.round(B.LEG*S)*3;
    return{W:(b.maxX-b.minX)+pad*2, H:(b.maxY-b.minY)+Math.round(B.TITLE*S)+pad*2+leg};
  }
  const{W:w1,H:h1}=bbox(1);
  let S=Math.max(MIN_S,Math.min(1,MAX_W/w1,MAX_H/h1));
  const{W:w2,H:h2}=bbox(S);
  S=Math.max(MIN_S,Math.min(1,S*Math.min(MAX_W/w2,MAX_H/h2)));
  return Math.max(MIN_S,Math.min(1,S));
}

function makeLayout(layers,mainId,S){
  const pad=Math.round(B.PAD*S), legH=Math.round(B.LEG*S)*3;
  const{pos:raw,bbox,cw,ch,cgap,ggap,vgap,th}=rawLayout(layers,mainId,S);
  const dx=pad-bbox.minX, dy=pad;
  const pos=new Map();
  raw.forEach((p,id)=>pos.set(id,{x:p.x+dx,y:p.y+dy,cx:p.cx+dx,cy:p.cy+dy}));
  const W=(bbox.maxX-bbox.minX)+pad*2;
  const H=(bbox.maxY-bbox.minY)+pad*2+th+legH;
  return{pos,W,H,cw,ch,cr:Math.round(B.CR*S),av:Math.round(B.AV*S),pad,legH,S};
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONNEXIONS — logique corrigée
//
//  Principe :
//  - Pour chaque ENFANT, on cherche ses parents dans la DB
//  - On calcule l'origine = milieu des parents placés (leurs cx + bottom)
//  - On ne dessine qu'UNE SEULE connexion par groupe de parents→enfants
//    (clé = ensemble des parents triés)
//  - Pour les T-junctions, même origine → barre → descentes
// ─────────────────────────────────────────────────────────────────────────────
function drawLinks(ctx,graph,pos,S,cw,ch){
  const uf=pt.join(__dirname,'..','data','users.json');
  let db={}; try{db=JSON.parse(fsys.readFileSync(uf,'utf8'));}catch{}
  const node=id=>db[id]||{partner:null,parents:[],children:[]};
  const relCol=id=>REL_INFO[graph.get(id)?.relation||'unknown']?.couleur||'#7c3aed';
  const lw=Math.max(.7,S*1.7);
  const drawn=new Set();

  // ── 1. Liens parent→enfant ────────────────────────────────────────────────
  //
  // On itère sur tous les nœuds du graph.
  // Pour chaque nœud qui a des enfants, on groupe les enfants visibles,
  // on calcule l'origine (bas du milieu du couple ou bas du parent solo),
  // et on trace UNE seule arborescence.

  for(const [parentId] of graph){
    const pp=pos.get(parentId); if(!pp) continue;
    const nd=node(parentId);

    // Enfants de ce parent qui sont dans le graph ET placés
    const children=(nd.children||[]).filter(cId=>graph.has(cId)&&pos.get(cId));
    if(!children.length) continue;

    // Éviter de traiter deux fois un groupe de parents (Killian + Léane)
    // Clé = parents communs triés de tous les enfants, dédoublonné
    // Pour chaque enfant, on trouve ses parents communs avec parentId
    // et on forme des groupes d'enfants qui partagent le même ensemble de parents

    // Grouper les enfants par ensemble de parents (string clé)
    const childGroups=new Map(); // "parent1|parent2" → [enfantIds]
    children.forEach(cId=>{
      const allParents=(node(cId).parents||[])
        .filter(p=>pos.get(p)&&graph.has(p))
        .sort()
        .join('|');
      if(!childGroups.has(allParents)) childGroups.set(allParents,[]);
      childGroups.get(allParents).push(cId);
    });

    for(const[parentKey,kids] of childGroups){
      // Éviter de redessiner ce groupe
      const ek=[parentKey,...kids.sort()].join('→');
      if(drawn.has(ek)) continue; drawn.add(ek);

      // Origines parents
      const parentIds=parentKey.split('|').filter(Boolean);
      const parentPositions=parentIds.map(p=>pos.get(p)).filter(Boolean);
      if(!parentPositions.length) continue;

      // Origine X = moyenne des cx des parents
      const ox=parentPositions.reduce((s,p)=>s+p.cx,0)/parentPositions.length;
      // Origine Y = bas de la rangée des parents (toutes au même Y si bien placés)
      const fy=Math.max(...parentPositions.map(p=>p.y+ch));

      // Couleur de la ligne = couleur du premier enfant
      const lc=relCol(kids[0]);

      if(kids.length===1){
        // Connexion simple : bezier ox→cx enfant
        const cp=pos.get(kids[0]);
        const tx=cp.cx, ty=cp.y;
        const bmy=fy+(ty-fy)*.42;
        ctx.save(); ctx.globalAlpha=.58; ctx.strokeStyle=lc; ctx.lineWidth=lw; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(ox,fy); ctx.bezierCurveTo(ox,bmy,tx,bmy,tx,ty);
        ctx.stroke(); ctx.restore();
      } else {
        // T-junction
        const xs=kids.map(c=>pos.get(c).cx);
        const minX=Math.min(...xs), maxX=Math.max(...xs);
        const midY=fy+(pos.get(kids[0]).y-fy)*.38;

        // Tige verticale depuis l'origine
        seg(ctx,ox,fy,ox,midY,lc,.56,lw,null);
        // Barre horizontale
        seg(ctx,minX,midY,maxX,midY,lc,.56,lw,null);
        // Descentes individuelles
        kids.forEach(cId=>{
          const cp=pos.get(cId); if(!cp) return;
          seg(ctx,cp.cx,midY,cp.cx,cp.y,relCol(cId),.56,lw,null);
        });
      }
    }
  }

  // ── 2. Liens conjoint ─────────────────────────────────────────────────────
  const drawnC=new Set();
  for(const [id] of graph){
    const p=pos.get(id); if(!p) continue;
    const pid=node(id).partner;
    if(!pid||!pos.get(pid)) continue;
    const ek=[id,pid].sort().join('♥');
    if(drawnC.has(ek)) continue; drawnC.add(ek);
    const pp=pos.get(pid);
    const x1=Math.min(p.x,pp.x)+cw, x2=Math.max(p.x,pp.x);
    if(x2>x1+1){
      seg(ctx,x1,p.cy,x2,p.cy,COL.heart,.85,lw,[Math.round(S*4),Math.round(S*3)]);
      heartDraw(ctx,(x1+x2)/2,p.cy-Math.round(S*7),Math.round(S*6),COL.heart);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POINT D'ENTRÉE
// ─────────────────────────────────────────────────────────────────────────────
async function generateFamilyTree(_,userMap,mainId){
  const{nodes:graph,layers}=getFamilyLayout(mainId);

  if(!layers.length||graph.size<=1){
    const c=createCanvas(560,160); const ctx=c.getContext('2d');
    drawBg(ctx,560,160);
    ctx.fillStyle=COL.text; ctx.font='bold 16px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Aucune famille',280,80);
    return c.toBuffer('image/png');
  }

  const S=computeScale(layers,mainId);
  const{pos,W,H,cw,ch,cr,av,pad,legH}=makeLayout(layers,mainId,S);

  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');

  drawBg(ctx,W,H);
  drawLinks(ctx,graph,pos,S,cw,ch);

  const draws=[];
  for(const[id,info] of graph){
    const p=pos.get(id); if(!p) continue;
    const u=userMap[id]||{username:'Inconnu',avatarURL:null,pets:[]};
    const ri=REL_INFO[info.relation]||{label:info.relation,couleur:'#64748b'};
    draws.push(drawCard(ctx,p.x,p.y,cw,ch,cr,av,ri.couleur,
      u.username,id===mainId?null:ri.label,u.avatarURL,id===mainId,u.pets||[],S));
  }
  await Promise.all(draws);

  const cnt=[...graph.keys()].filter(id=>pos.get(id)).length;
  drawTitle(ctx,W,S,userMap[mainId]?.username??'???',cnt,pad);
  drawLegend(ctx,W,H,S,graph);

  return canvas.toBuffer('image/png');
}

module.exports={generateFamilyTree};
