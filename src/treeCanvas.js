/**
 * treeCanvas.js — Rendu canvas arbre généalogique
 * Layout basé sur groupes couple, animaux en sous-carte
 */
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getFamilyLayout, REL_INFO } = require('./familyGraph');

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG0='#07050f', BG1='#0b0918', BG2='#0f0c22';
const CARD_BG = '#120e24';
const TEXT='#ede9fe', TEXTMUT='#3e3456';

// ─── Dimensions ───────────────────────────────────────────────────────────────
const CW=186, CH=68, CR=14;        // card width / height / corner radius
const PET_W=76, PET_H=24, PET_CR=8; // mini pet card
const AV=21;                        // avatar radius
const COUPLE_GAP=6;                 // gap entre les deux cartes d'un couple
const GROUP_GAP=32;                 // gap entre groupes distincts
const ROW_GAP=110;                  // gap vertical entre générations
const PAD_X=56, PAD_Y=62;

// ─── Helpers couleur ──────────────────────────────────────────────────────────
function h2r(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}
function rgba(h,a){const{r,g,b}=h2r(h);return`rgba(${r},${g},${b},${a})`;}
function lighten(h,t){const{r,g,b}=h2r(h);return`rgb(${Math.min(255,r+Math.round(t*255))},${Math.min(255,g+Math.round(t*255))},${Math.min(255,b+Math.round(t*255))})`;}

// ─── Helpers dessin ───────────────────────────────────────────────────────────
function rr(ctx,x,y,w,h,r,fill,stroke,sw=1.5,alpha=1){
  ctx.save(); ctx.globalAlpha=alpha;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=sw;ctx.stroke();}
  ctx.restore();
}

function line(ctx,x1,y1,x2,y2,col,a=0.6,w=1.8,dash=[]){
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';
  if(dash.length)ctx.setLineDash(dash);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.setLineDash([]);ctx.restore();
}

function bezier(ctx,x1,y1,x2,y2,col,a=0.65,w=2){
  const my=(y1+y2)/2;
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.bezierCurveTo(x1,my,x2,my,x2,y2);ctx.stroke();ctx.restore();
}

// Coeur canvas pur
function heart(ctx,cx,cy,s=7){
  ctx.save();ctx.fillStyle='#f471b5';ctx.globalAlpha=.95;
  ctx.beginPath();
  ctx.moveTo(cx,cy+s*.35);
  ctx.bezierCurveTo(cx,cy-s*.2,cx-s,cy-s*.2,cx-s,cy+s*.45);
  ctx.bezierCurveTo(cx-s,cy+s,cx,cy+s*1.5,cx,cy+s*1.5);
  ctx.bezierCurveTo(cx,cy+s*1.5,cx+s,cy+s,cx+s,cy+s*.45);
  ctx.bezierCurveTo(cx+s,cy-s*.2,cx,cy-s*.2,cx,cy+s*.35);
  ctx.fill();ctx.restore();
}

// Avatar avec halo
async function drawAv(ctx,url,cx,cy,r,col){
  // Halo
  ctx.save();
  const h=ctx.createRadialGradient(cx,cy,r*.5,cx,cy,r+6);
  h.addColorStop(0,rgba(col,.28));h.addColorStop(1,rgba(col,0));
  ctx.fillStyle=h;ctx.beginPath();ctx.arc(cx,cy,r+6,0,Math.PI*2);ctx.fill();ctx.restore();
  // Ring
  ctx.save();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r+1,0,Math.PI*2);ctx.stroke();ctx.restore();
  if(url){
    try{
      const img=await loadImage(url+'?size=64');
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
      ctx.drawImage(img,cx-r,cy-r,r*2,r*2);ctx.restore();return;
    }catch{}
  }
  ctx.save();
  const g=ctx.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  g.addColorStop(0,lighten(col,.25));g.addColorStop(1,col);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='#fff';ctx.font=`bold ${r}px sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',cx,cy+1);ctx.restore();
}

// Carte principale
async function drawCard(ctx,x,y,opts){
  const{name,role,avURL,col,isMain,w=CW}=opts;
  // Glow shadow
  ctx.save();ctx.shadowColor=rgba(col,isMain?.45:.2);ctx.shadowBlur=isMain?24:10;
  rr(ctx,x,y,w,CH,CR,CARD_BG,null);ctx.restore();
  // Fond gradient
  const gf=ctx.createLinearGradient(x,y,x+w,y+CH);
  gf.addColorStop(0,lighten(col,.06));gf.addColorStop(1,CARD_BG);
  rr(ctx,x,y,w,CH,CR,gf,null);
  // Bordure
  ctx.save();if(isMain){ctx.shadowColor=col;ctx.shadowBlur=8;}
  rr(ctx,x,y,w,CH,CR,null,col,isMain?2.4:1.6,.88);ctx.restore();
  // Top bar
  ctx.save();ctx.globalAlpha=.45;
  const bar=ctx.createLinearGradient(x+CR,y,x+w-CR,y);
  bar.addColorStop(0,'transparent');bar.addColorStop(.3,col);bar.addColorStop(.7,col);bar.addColorStop(1,'transparent');
  ctx.fillStyle=bar;ctx.fillRect(x+CR,y,w-CR*2,1.5);ctx.restore();
  // Avatar
  const avX=x+AV+11,avY=y+CH/2;
  await drawAv(ctx,avURL||null,avX,avY,AV,col);
  // Texte
  const tx=x+AV*2+17,maxW=w-AV*2-22;
  ctx.save();ctx.fillStyle=TEXT;ctx.font=(isMain?'bold ':'600 ')+'14px sans-serif';ctx.textBaseline='middle';
  let n=name;while(n.length>1&&ctx.measureText(n).width>maxW)n=n.slice(0,-1);
  if(n!==name)n=n.slice(0,-1)+'..';
  ctx.fillText(n,tx,y+CH/2-(role?7.5:0));
  if(role){
    ctx.fillStyle=rgba(col,.85);ctx.font='10.5px sans-serif';
    let r2=role;while(r2.length>1&&ctx.measureText(r2).width>maxW)r2=r2.slice(0,-1);
    if(r2!==role)r2=r2.slice(0,-1)+'..';
    ctx.fillText(r2,tx,y+CH/2+8.5);
  }
  ctx.restore();
}

// Mini carte animal
function drawPetCard(ctx,x,y,pet,col){
  const PET_ICONS={chien:'D',chat:'C',poisson:'P',serpent:'S',oiseau:'B'};
  rr(ctx,x,y,PET_W,PET_H,PET_CR,rgba(col,.12),col,1,.85);
  ctx.save();ctx.fillStyle=rgba(col,.7);ctx.font='bold 9px sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';
  const ico=PET_ICONS[pet.type]||'?';
  // Petit cercle icone
  ctx.fillStyle=rgba(col,.9);ctx.beginPath();ctx.arc(x+10,y+PET_H/2,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 8px sans-serif';ctx.textAlign='center';
  ctx.fillText(ico,x+10,y+PET_H/2+0.5);
  // Nom
  ctx.fillStyle=rgba(col,.9);ctx.font='9px sans-serif';ctx.textAlign='left';
  let nm=pet.name;while(nm.length>1&&ctx.measureText(nm).width>PET_W-24)nm=nm.slice(0,-1);
  if(nm!==pet.name)nm=nm.slice(0,-1)+'..';
  ctx.fillText(nm,x+19,y+PET_H/2+0.5);
  ctx.restore();
}

// ─── CALCUL POSITIONS ─────────────────────────────────────────────────────────
/**
 * Calcule la largeur d'un groupe (en pixels)
 * Un groupe = [id] ou [id1, id2] (couple)
 */
function groupWidth(g) {
  return g.length===1 ? CW : CW*2+COUPLE_GAP;
}

/**
 * Calcule la largeur totale d'une couche
 */
function layerWidth(groups) {
  return groups.reduce((s,g,i)=>s+groupWidth(g)+(i>0?GROUP_GAP:0),0);
}

/**
 * Pour chaque groupe, calcule le "centre X du couple" (cx moyen des deux cartes)
 * Retourne { id -> {x, y, cx, cy, petY} }
 */
function computePositions(layers, W, mainId, userMap) {
  const pos = {}; // id -> {x,y,cx,cy}

  // Trouver la couche qui contient mainId pour la centrer exactement
  const mainLayerIdx = layers.findIndex(l => l.groups.some(g=>g.includes(mainId)));

  layers.forEach((layer, li) => {
    const y = PAD_Y + li*(CH+ROW_GAP);
    const lw = layerWidth(layer.groups);
    let startX = (W - lw) / 2;

    // Si cette couche contient mainId, on s'assure qu'il est centré
    // On cherche la position du groupe focal et on décale
    const focalGrpIdx = layer.groups.findIndex(g=>g.includes(mainId));
    if (focalGrpIdx >= 0) {
      // Calculer le cx naturel du groupe focal
      let cx=startX;
      for(let gi=0;gi<focalGrpIdx;gi++) cx+=groupWidth(layer.groups[gi])+GROUP_GAP;
      cx+=groupWidth(layer.groups[focalGrpIdx])/2;
      // Décaler pour que ce cx soit au centre
      startX += (W/2 - cx);
    }

    let curX = startX;
    layer.groups.forEach(group => {
      if (group.length===1) {
        const id=group[0];
        pos[id]={x:curX,y,cx:curX+CW/2,cy:y+CH/2};
      } else {
        // Couple : id1 à gauche, id2 à droite
        const [id1,id2]=group;
        pos[id1]={x:curX,y,cx:curX+CW/2,cy:y+CH/2};
        pos[id2]={x:curX+CW+COUPLE_GAP,y,cx:curX+CW+COUPLE_GAP+CW/2,cy:y+CH/2};
      }
      curX+=groupWidth(group)+GROUP_GAP;
    });
  });

  return pos;
}

// ─── CONNEXIONS ───────────────────────────────────────────────────────────────
function drawConnections(ctx, layers, pos, graph, userMap) {
  const fs2=require('fs'),path2=require('path');
  let users={};
  try{users=JSON.parse(fs2.readFileSync(path2.join(__dirname,'..','data','users.json'),'utf8'));}catch{}
  const u=id=>users[id]||{partner:null,parents:[],children:[]};
  const drawn=new Set();

  for(const layer of layers){
    for(const group of layer.groups){
      for(const id of group){
        const p=pos[id]; if(!p) continue;
        const info=graph.get(id);
        const col=REL_INFO[info?.relation||'unknown']?.couleur||'#7c3aed';
        const node=u(id);

        // Liens parents
        for(const pId of (node.parents||[])){
          const pp=pos[pId]; if(!pp) continue;
          const ek=[id,pId].sort().join(':');
          if(drawn.has(ek)){continue;} drawn.add(ek);

          const pCol=REL_INFO[graph.get(pId)?.relation||'unknown']?.couleur||'#7c3aed';

          // Trouver les coparents (l'autre parent si couple)
          const coParents=(node.parents||[]).filter(x=>x!==pId&&pos[x]);

          // Trouver les freres/soeurs qui partagent ce parent
          const sharedChildren=[...graph.keys()].filter(sId=>{
            if(sId===id)return false;
            const s=u(sId);
            return s.parents?.includes(pId)&&pos[sId];
          });

          if(sharedChildren.length===0){
            // Ligne simple bezier
            bezier(ctx,pp.cx,pp.y+CH,p.cx,p.y,pCol,.65,1.8);
          } else {
            // T-junction : tige + barre + descentes
            const allKids=[id,...sharedChildren].filter(x=>pos[x]);
            const allCx=allKids.map(x=>pos[x].cx);
            const minCx=Math.min(...allCx), maxCx=Math.max(...allCx);

            // Point de départ = cx du couple (si les deux parents sont là)
            let originCx=pp.cx;
            if(coParents.length>0&&pos[coParents[0]]){
              originCx=(pp.cx+pos[coParents[0]].cx)/2;
            }

            const midY=pp.y+CH+(p.y-(pp.y+CH))*0.42;

            // Tige
            line(ctx,originCx,pp.y+CH,originCx,midY,pCol,.6,1.8);
            // Barre horizontale
            line(ctx,minCx,midY,maxCx,midY,pCol,.6,1.8);
            // Descentes
            allKids.forEach(cId=>{
              const cp=pos[cId];
              if(cp) line(ctx,cp.cx,midY,cp.cx,cp.y,REL_INFO[graph.get(cId)?.relation||'unknown']?.couleur||pCol,.6,1.8);
            });
          }
        }

        // Lien conjoint (horizontal avec coeur)
        if(node.partner&&pos[node.partner]){
          const ek2=[id,node.partner].sort().join(':♥:');
          if(!drawn.has(ek2)){
            drawn.add(ek2);
            const pp2=pos[node.partner];
            const ly=p.cy;
            const x1=Math.min(p.x,pp2.x)+CW;
            const x2=Math.max(p.x,pp2.x);
            if(x2>x1+2){
              // Ligne pointillee entre les deux cartes
              line(ctx,x1,ly,x2,ly,'#f471b5',.8,2,[4,3]);
              heart(ctx,(x1+x2)/2,ly-8,6);
            }
          }
        }
      }
    }
  }
}

// ─── GENERATEUR PRINCIPAL ─────────────────────────────────────────────────────
async function generateFamilyTree(treeDataUnused, userMap, mainId) {
  const { nodes: graph, layers } = getFamilyLayout(mainId);

  // ── Calcul largeur canvas ─────────────────────────────────────────────────
  // On cherche la couche la plus large
  const maxLW = Math.max(...layers.map(l=>layerWidth(l.groups)), 400);
  const W = Math.max(maxLW + PAD_X*2, 720);

  // ── Hauteur : on compte aussi les animaux sous chaque carte ──────────────
  // (chaque animal = PET_H + 4 de gap)
  const PET_MARGIN = 6;
  function petsHeight(id){
    const pets=(userMap[id]?.pets||[]);
    return pets.length>0 ? pets.length*(PET_H+4)+PET_MARGIN : 0;
  }

  // Calcul H avec les animaux
  const nLayers=layers.length;
  const H = Math.max(PAD_Y*2 + nLayers*CH + (nLayers-1)*ROW_GAP
    + Math.max(...[...graph.keys()].map(id=>petsHeight(id)||0)) + 60, 380);

  const canvas=createCanvas(W,H);
  const ctx=canvas.getContext('2d');

  // ── Fond ──────────────────────────────────────────────────────────────────
  const bg=ctx.createLinearGradient(0,0,W*.55,H);
  bg.addColorStop(0,BG0);bg.addColorStop(.5,BG1);bg.addColorStop(1,BG2);
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  [[.12,.18,.42,'rgba(65,10,125,.13)'],[.88,.78,.3,'rgba(10,45,110,.1)'],[.5,.5,.6,'rgba(30,5,70,.06)']].forEach(([fx,fy,fr,fc])=>{
    const n=ctx.createRadialGradient(W*fx,H*fy,0,W*fx,H*fy,W*fr);
    n.addColorStop(0,fc);n.addColorStop(1,'transparent');ctx.fillStyle=n;ctx.fillRect(0,0,W,H);
  });
  for(let i=0;i<120;i++){
    ctx.save();ctx.fillStyle='#c4b5fd';ctx.globalAlpha=Math.random()*.18+.02;
    ctx.beginPath();ctx.arc(Math.random()*W,Math.random()*H,Math.random()*1.1+.15,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  // ── Positions ─────────────────────────────────────────────────────────────
  const pos=computePositions(layers, W, mainId, userMap);

  // ── Connexions ────────────────────────────────────────────────────────────
  drawConnections(ctx, layers, pos, graph, userMap);

  // ── Cartes ────────────────────────────────────────────────────────────────
  const promises=[];
  for(const [id,info] of graph){
    const p=pos[id]; if(!p) continue;
    const u2=userMap[id]||{username:'Inconnu',avatarURL:null,pets:[]};
    const rel=info.relation;
    const ri=REL_INFO[rel]||REL_INFO.unknown;
    const isMain=id===mainId;

    promises.push(drawCard(ctx,p.x,p.y,{
      name:u2.username,
      role:isMain?null:ri.label,
      avURL:u2.avatarURL,
      col:ri.couleur,
      isMain,
    }));

    // Animaux sous la carte
    const pets=u2.pets||[];
    if(pets.length>0){
      const petStartX=p.cx-((pets.length*PET_W+(pets.length-1)*4))/2;
      pets.forEach((pet,pi)=>{
        const px=petStartX+pi*(PET_W+4);
        const py=p.y+CH+PET_MARGIN+pi*0;
        // Toutes en ligne horizontale sous la carte
        drawPetCard(ctx,petStartX+pi*(PET_W+4),p.y+CH+PET_MARGIN,pet,ri.couleur);
      });
      // Petite ligne de connexion carte->animaux
      ctx.save();ctx.globalAlpha=.3;ctx.strokeStyle=ri.couleur;ctx.lineWidth=1;ctx.setLineDash([2,3]);
      ctx.beginPath();ctx.moveTo(p.cx,p.y+CH);ctx.lineTo(p.cx,p.y+CH+PET_MARGIN);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
    }
  }
  await Promise.all(promises);

  // ── Titre ─────────────────────────────────────────────────────────────────
  const mName=userMap[mainId]?.username??'???';
  ctx.save();
  const tg=ctx.createLinearGradient(W/2-200,0,W/2+200,0);
  tg.addColorStop(0,'#a855f7');tg.addColorStop(.5,'#ede9fe');tg.addColorStop(1,'#ec4899');
  ctx.fillStyle=tg;ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  ctx.shadowColor='#9333ea';ctx.shadowBlur=14;
  ctx.fillText(`Arbre de ${mName}`,W/2,14);ctx.restore();

  const memberCount=[...graph.keys()].filter(id=>pos[id]).length;
  ctx.save();ctx.fillStyle=TEXTMUT;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  ctx.fillText(`${memberCount} membre${memberCount>1?'s':''} dans la famille`,W/2,40);ctx.restore();

  // ── Légende ───────────────────────────────────────────────────────────────
  const presentRels=new Set([...graph.values()].map(n=>n.relation));
  presentRels.delete('self');
  const legendItems=[...presentRels].map(k=>[k,REL_INFO[k]||REL_INFO.unknown]).filter(([,v])=>v);
  const LW=118, perRow=Math.floor((W-PAD_X*2)/LW);
  const lRows=[];
  for(let i=0;i<legendItems.length;i+=perRow) lRows.push(legendItems.slice(i,i+perRow));
  lRows.forEach((row,ri)=>{
    const tw=row.length*LW, lx=(W-tw)/2, ly=H-18-(lRows.length-1-ri)*16;
    row.forEach(([,info],i)=>{
      const x=lx+i*LW;
      ctx.save();ctx.fillStyle=info.couleur;ctx.globalAlpha=.9;
      ctx.beginPath();ctx.arc(x+6,ly,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#4a4060';ctx.font='10px sans-serif';ctx.textBaseline='middle';ctx.globalAlpha=.8;
      ctx.fillText(info.label,x+14,ly);ctx.restore();
    });
  });

  return canvas.toBuffer('image/png');
}

module.exports = { generateFamilyTree };
