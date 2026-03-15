// ── Retro Ice · Game Engine ──────────────────────────────
// Landscape canvas figure skating game

(function(){
'use strict';

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ── Constants ────────────────────────────────────────────
const W = 480, H = 270; // internal resolution (16:9)
canvas.width  = W;
canvas.height = H;

const SKIN_COLORS   = ['#fde8c0','#f4c77c','#d4956a','#b0713a','#7a4420','#4a2510'];
const HAIR_COLORS   = ['#f8e060','#e0a030','#b06020','#7a3a10','#3a1808','#1a1010','#aabbcc','#e88090','#60c0a0','#8060d0'];
const OUTFIT_COLORS = ['#e03050','#4060e0','#208040','#c0a020','#c050c0','#2090a0','#e06020','#204060','#ffffff','#202020'];

// ── Palette ───────────────────────────────────────────────
const C = {
  iceDeep:'#5ab8d8', iceMid:'#90d8f0', iceLight:'#c8eef8', iceWhite:'#e8f8ff',
  rinkBg:'#b8e4f4', rinkLine:'rgba(100,180,220,0.35)',
  crowd1:'#c05070', crowd2:'#5080c0', crowd3:'#80c050', crowd4:'#c0a030', crowd5:'#8050c0',
  bleacher:'#0d1e38', wall:'#1a3050', wallTop:'#2a5880',
  gold:'#ffd700', red:'#e03050', white:'#ffffff',
  shadow:'rgba(30,80,120,0.2)',
};

// ── State ─────────────────────────────────────────────────
let saveData = null;
let slot = 1;
let gameState = 'playing'; // playing | gameover | paused | eventEnd
let score = 0, combo = 1, maxCombo = 1;
let timeLeft = 90, lastTime = 0;
let level = 1;

// Move system
let moveQueue = [];
let moveQueueTimer = 0;
const MOVE_WINDOW = 0.55; // seconds to chain moves

const MOVES = [
  { name:'AXEL!',    seq:['jump','spin'], pts:900,  color:'#ffd700'},
  { name:'LUTZ!',    seq:['spin','jump'], pts:750,  color:'#ff6030'},
  { name:'SALCHOW!', seq:['jump','pose'], pts:650,  color:'#ff88cc'},
  { name:'FLIP!',    seq:['pose','jump'], pts:600,  color:'#88ff88'},
  { name:'TOE LOOP!',seq:['pose','spin'], pts:550,  color:'#88ccff'},
  { name:'SPIN!',    seq:['spin'],        pts:350,  color:'#60c0ff'},
  { name:'JUMP!',    seq:['jump'],        pts:180,  color:'#ffcc44'},
  { name:'SPIRAL!',  seq:['pose'],        pts:250,  color:'#80ffcc'},
];

// Skater
const sk = {
  x:240, y:150,
  vx:0,
  facing:1,
  grounded:true,
  jumpT:0, jumping:false, jumpH:0,
  spinT:0, spinning:false,
  poseT:0, posing:false,
  walkT:0,
  trail:[],
  sparkles:[],
  skin:1, hair:4, outfit:0, gender:'female',
};

// Crowd
const crowd = [];
(function buildCrowd(){
  for(let row=0;row<3;row++){
    const cols = [C.crowd1,C.crowd2,C.crowd3,C.crowd4,C.crowd5];
    for(let i=0;i<28;i++){
      crowd.push({
        x:i*18+4, row,
        color:cols[Math.floor(Math.random()*cols.length)],
        wave:Math.random()*Math.PI*2,
        waving:false, waveTimer:0,
        head:SKIN_COLORS[Math.floor(Math.random()*SKIN_COLORS.length)],
      });
    }
  }
})();

let popups = [];

// ── Input ──────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e=>{
  if(keys[e.code]) return;
  keys[e.code]=true;
  if(gameState!=='playing') return;
  if(e.code==='ArrowLeft')  { sk.vx=-1.6; sk.facing=-1; }
  if(e.code==='ArrowRight') { sk.vx= 1.6; sk.facing= 1; }
  if(e.code==='KeyZ'&&sk.grounded&&!sk.jumping) doJump();
  if(e.code==='KeyX'&&!sk.spinning)             doSpin();
  if(e.code==='Space'&&sk.grounded&&!sk.posing) doPose();
  if(['Space','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e=>{
  keys[e.code]=false;
  if(e.code==='ArrowLeft'||e.code==='ArrowRight') sk.vx*=0.25;
});

// ── Move triggers ──────────────────────────────────────────
function doJump(){
  sk.jumping=true; sk.grounded=false; sk.jumpT=0;
  pushMove('jump');
  setTimeout(()=>{ sk.jumping=false; sk.grounded=true; evalMoves(); }, 600);
}
function doSpin(){
  sk.spinning=true; sk.spinT=0;
  pushMove('spin');
  addSparkles(sk.x, sk.y-14, 6);
  setTimeout(()=>{ sk.spinning=false; evalMoves(); }, 500);
}
function doPose(){
  sk.posing=true; sk.poseT=0;
  pushMove('pose');
  addSparkles(sk.x, sk.y-16, 8);
  setTimeout(()=>{ sk.posing=false; evalMoves(); }, 700);
}

function pushMove(m){
  moveQueue.push(m);
  moveQueueTimer = MOVE_WINDOW;
  if(moveQueue.length>4) moveQueue.shift();
}

function evalMoves(){
  // Try longest match first
  for(const mv of MOVES){
    const seq = mv.seq;
    if(moveQueue.length < seq.length) continue;
    // check tail of queue
    const tail = moveQueue.slice(-seq.length);
    if(tail.join(','===seq.join(',')) || seqMatch(tail,seq)){
      triggerMove(mv);
      moveQueue=[];
      return;
    }
  }
}

function seqMatch(a,b){
  if(a.length!==b.length) return false;
  return a.every((v,i)=>v===b[i]);
}

function triggerMove(mv){
  const pts = mv.pts * combo;
  score += pts;
  combo = Math.min(combo+1, 10);
  maxCombo = Math.max(maxCombo, combo);
  popups.push({x:sk.x, y:sk.y-24, text:mv.name, pts, color:mv.color, age:0});
  addSparkles(sk.x, sk.y-20, 14);
  waveCrowd();
  updateHUD();
  // Auto-save score
  if(saveData){
    SaveSystem.updateScore(slot, pts);
  }
}

function waveCrowd(){
  crowd.forEach(p=>{ p.waving=true; p.waveTimer=1.5; });
}

function addSparkles(x,y,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const s=0.5+Math.random()*2.5;
    sk.sparkles.push({
      x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,
      age:0,life:0.5+Math.random()*0.7,
      size:Math.random()<0.5?2:1,
      color:['#fff','#ffd700','#4ac8f0','#ffccee'][Math.floor(Math.random()*4)],
    });
  }
}

// ── HUD update ─────────────────────────────────────────────
function updateHUD(){
  const el = id=>document.getElementById(id);
  if(el('hudScore'))  el('hudScore').textContent  = score;
  if(el('hudCombo'))  el('hudCombo').textContent  = 'x'+combo;
  if(el('hudTime'))   el('hudTime').textContent   = Math.ceil(timeLeft);
  if(el('hudLevel'))  el('hudLevel').textContent  = level;
  if(el('hudName'))   el('hudName').textContent   = saveData
    ? saveData.skater.firstName+' '+saveData.skater.lastName
    : 'SKATER';
}

// ── Update ─────────────────────────────────────────────────
function update(dt){
  if(gameState!=='playing') return;

  timeLeft -= dt;
  if(timeLeft<=0){ timeLeft=0; endGame(); return; }
  level = Math.min(5, Math.floor((90-timeLeft)/18)+1);

  // Move queue timeout
  if(moveQueue.length>0){
    moveQueueTimer -= dt;
    if(moveQueueTimer<=0){ moveQueue=[]; }
  }

  // Skater position
  sk.x += sk.vx;
  sk.x = Math.max(16, Math.min(W-16, sk.x));
  sk.vx *= 0.97;

  // Jump arc
  if(sk.jumping){
    sk.jumpT = Math.min(sk.jumpT + dt/0.6, 1);
    sk.jumpH = Math.sin(sk.jumpT*Math.PI) * 26;
  } else { sk.jumpH=0; }

  if(sk.spinning) sk.spinT = Math.min(sk.spinT+dt/0.5, 1);
  if(sk.posing)   sk.poseT = Math.min(sk.poseT+dt/0.7, 1);

  sk.walkT += dt * (Math.abs(sk.vx)*3+2);

  // Trail
  if(Math.abs(sk.vx)>0.1 || sk.jumping){
    sk.trail.push({x:sk.x, y:sk.y, age:0});
  }
  sk.trail.forEach(t=>t.age+=dt);
  sk.trail = sk.trail.filter(t=>t.age<0.8);

  // Sparkles
  sk.sparkles.forEach(s=>{
    s.x+=s.vx; s.y+=s.vy; s.vy+=0.06; s.age+=dt;
  });
  sk.sparkles = sk.sparkles.filter(s=>s.age<s.life);

  // Crowd wave
  crowd.forEach(p=>{
    if(p.waving){ p.waveTimer-=dt; p.wave+=dt*6; if(p.waveTimer<=0) p.waving=false; }
    else { p.wave+=dt*0.2; }
  });

  // Popups float up
  popups.forEach(p=>{ p.age+=dt; p.y-=dt*20; });
  popups = popups.filter(p=>p.age<1.4);

  updateHUD();
}

// ── Draw ───────────────────────────────────────────────────
function drawRink(){
  // Ice
  const g = ctx.createLinearGradient(0,60,0,H);
  g.addColorStop(0,'#b8e4f4');
  g.addColorStop(0.4,'#d4f0ff');
  g.addColorStop(1,'#a8daf0');
  ctx.fillStyle=g;
  ctx.fillRect(0,60,W,H-60);

  // Rink border
  ctx.strokeStyle='rgba(80,160,210,0.5)';
  ctx.lineWidth=2;
  ctx.strokeRect(8,62,W-16,H-70);

  // Center circle
  ctx.strokeStyle=C.rinkLine;
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(W/2,H/2+16,50,0,Math.PI*2); ctx.stroke();

  // Center cross
  ctx.beginPath();
  ctx.moveTo(12,H/2+16); ctx.lineTo(W-12,H/2+16);
  ctx.moveTo(W/2,66); ctx.lineTo(W/2,H-10);
  ctx.stroke();

  // Red dot
  ctx.fillStyle=C.red;
  ctx.fillRect(W/2-2,H/2+14,4,4);

  // Crease boxes
  ctx.strokeStyle='rgba(200,60,80,0.3)';
  ctx.lineWidth=1;
  ctx.strokeRect(8,62,80,40);
  ctx.strokeRect(W-88,62,80,40);
}

function drawBleachers(){
  // Bleacher tiers
  const tiers=[
    {y:0,h:20,col:'#0a1828'},
    {y:20,h:18,col:'#0d1e30'},
    {y:38,h:16,col:'#101828'},
  ];
  tiers.forEach(t=>{ ctx.fillStyle=t.col; ctx.fillRect(0,t.y,W,t.h); });

  // Crowd
  crowd.forEach(p=>{
    const baseY=[14,28,44][p.row]||14;
    const wave = p.waving ? Math.sin(p.wave)*4 : Math.sin(p.wave)*1.2;
    const by = baseY - wave;

    ctx.fillStyle=p.color;
    ctx.fillRect(p.x, by, 8, 10);

    ctx.fillStyle=p.head;
    ctx.fillRect(p.x+1, by-6, 6, 5);

    if(p.waving && Math.sin(p.wave)>0.2){
      ctx.fillStyle=p.color;
      ctx.fillRect(p.x-3, by-2, 3, 5);
      ctx.fillRect(p.x+8, by-2, 3, 5);
    }
  });

  // Rink wall
  ctx.fillStyle=C.wall;
  ctx.fillRect(0,54,W,8);
  ctx.fillStyle=C.wallTop;
  ctx.fillRect(0,54,W,3);
}

function drawTrail(){
  sk.trail.forEach(t=>{
    const a=(1-t.age/0.8)*0.45;
    ctx.fillStyle=`rgba(180,230,255,${a})`;
    ctx.fillRect(Math.round(t.x)-4,Math.round(t.y),8,2);
  });
}

function drawSparkles(){
  sk.sparkles.forEach(s=>{
    const a=1-s.age/s.life;
    ctx.globalAlpha=a;
    ctx.fillStyle=s.color;
    const sz=s.size;
    ctx.fillRect(Math.round(s.x),Math.round(s.y),sz,sz);
  });
  ctx.globalAlpha=1;
}

function drawSkater(){
  const x  = Math.round(sk.x);
  const by = Math.round(sk.y);
  const jh = Math.round(sk.jumpH);
  const y  = by - jh;
  const f  = sk.facing;

  const skin   = SKIN_COLORS[saveData?.skater.skin  ?? sk.skin];
  const hair   = HAIR_COLORS[saveData?.skater.hair  ?? sk.hair];
  const outfit = OUTFIT_COLORS[saveData?.skater.outfit ?? sk.outfit];
  const female = (saveData?.skater.gender??sk.gender)==='female';

  // Shadow (larger when high)
  const sw = 14+jh*0.5;
  ctx.fillStyle=C.shadow;
  ctx.fillRect(x-sw/2, by-2, sw, 4);

  if(sk.spinning){
    // Spinning form
    const spinOff = Math.sin(sk.spinT*Math.PI*8)*3;
    ctx.fillStyle=outfit;
    ctx.fillRect(x-4+spinOff, y-16, 8, 14);
    ctx.fillStyle=skin;
    ctx.fillRect(x-3,y-22,6,7);
    ctx.fillStyle=hair;
    ctx.fillRect(x-3,y-24,6,3);
    ctx.fillStyle='rgba(255,255,255,0.4)';
    ctx.fillRect(x-6,y-24,12,20);
  } else if(sk.posing){
    // Arabesque
    ctx.fillStyle=outfit;
    ctx.fillRect(x-4,y-18,8,10);
    // Extended leg
    ctx.fillStyle=female?outfit:'#1a2a4a';
    ctx.fillRect(x+f*2,y-6,f*14,4);
    // Standing leg
    ctx.fillRect(x-3,y-8,6,8);
    // Arms out
    ctx.fillStyle=outfit;
    ctx.fillRect(x-12,y-16,10,3);
    ctx.fillRect(x+2,y-16,10,3);
    // Head
    ctx.fillStyle=skin;
    ctx.fillRect(x-3,y-24,6,7);
    ctx.fillStyle=hair;
    ctx.fillRect(x-3,y-26,6,female?5:3);
    // Boot
    ctx.fillStyle='#fff';
    ctx.fillRect(x-4,y-2,7,3);
  } else {
    // Walk/skate
    const wf = Math.floor(sk.walkT*5)%4;
    const legA = [0,2,0,-2][wf]*0.8;

    if(female){
      // Skirt
      ctx.fillStyle=outfit;
      ctx.fillRect(x-6,y-8,12,8);
      // Legs
      ctx.fillStyle=skin;
      ctx.fillRect(x-5+legA,y,5,8);
      ctx.fillRect(x+1-legA,y,5,8);
    } else {
      // Pants
      ctx.fillStyle='#1a2a4a';
      ctx.fillRect(x-5+legA,y-6,5,14);
      ctx.fillRect(x+1-legA,y-6,5,14);
    }
    // Body
    ctx.fillStyle=outfit;
    ctx.fillRect(x-5,y-20,10,12);
    // Arms
    ctx.fillStyle=outfit;
    if(sk.jumping){
      ctx.fillRect(x-10,y-22,5,3);
      ctx.fillRect(x+5,y-22,5,3);
    } else {
      ctx.fillRect(x-9,y-18+legA,4,3);
      ctx.fillRect(x+5,y-18-legA,4,3);
    }
    // Head
    ctx.fillStyle=skin;
    ctx.fillRect(x-4,y-28,8,9);
    // Hair
    ctx.fillStyle=hair;
    ctx.fillRect(x-4,y-30,8,female?5:3);
    if(female){
      ctx.fillRect(x+4,y-28,2,10);
      ctx.fillRect(x-6,y-28,2,10);
    }
    // Eyes
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.fillRect(x-2,y-25,2,2);
    ctx.fillRect(x+1,y-25,2,2);
    // Boots
    ctx.fillStyle='#f0f0f8';
    ctx.fillRect(x-6+legA,y+8,7,4);
    ctx.fillRect(x+1-legA,y+8,7,4);
    // Blades
    ctx.fillStyle='rgba(190,220,255,0.9)';
    ctx.fillRect(x-7+legA,y+12,9,1);
    ctx.fillRect(x-legA,y+12,9,1);
  }
}

function drawPopups(){
  popups.forEach(p=>{
    const a=Math.max(0,1-p.age/1.4);
    ctx.globalAlpha=a;
    ctx.fillStyle=p.color;
    ctx.font='7px "Press Start 2P"';
    ctx.textAlign='center';
    ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
    ctx.fillStyle='#fff';
    ctx.font='5px "Press Start 2P"';
    ctx.fillText('+'+p.pts, Math.round(p.x), Math.round(p.y)+9);
  });
  ctx.globalAlpha=1;
  ctx.textAlign='left';
}

function drawTimerFlash(){
  if(timeLeft<=10 && Math.floor(Date.now()/220)%2===0){
    ctx.fillStyle='rgba(200,30,50,0.1)';
    ctx.fillRect(0,0,W,H);
  }
}

function drawGameOver(){
  ctx.fillStyle='rgba(0,5,18,0.82)';
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle='#0a0a2a';
  ctx.fillRect(W/2-110,H/2-80,220,160);
  ctx.strokeStyle='#4ac8f0';
  ctx.lineWidth=2;
  ctx.strokeRect(W/2-110,H/2-80,220,160);

  ctx.fillStyle=C.red;
  ctx.font='13px "Press Start 2P"';
  ctx.textAlign='center';
  ctx.fillText('EVENT OVER',W/2,H/2-48);

  ctx.fillStyle='#4ac8f0';
  ctx.font='6px "Press Start 2P"';
  ctx.fillText('FINAL SCORE',W/2,H/2-24);

  ctx.fillStyle=C.gold;
  ctx.font='16px "Press Start 2P"';
  ctx.fillText(score,W/2,H/2);

  ctx.fillStyle='#aabbcc';
  ctx.font='5px "Press Start 2P"';
  ctx.fillText('MAX COMBO  x'+maxCombo,W/2,H/2+18);

  const g = score>=8000?'S':score>=5000?'A':score>=2500?'B':score>=1000?'C':'D';
  const gc= {S:'#ffd700',A:'#80ff80',B:'#80c0ff',C:'#ffcc44',D:'#ff8080'}[g];
  ctx.fillStyle=gc;
  ctx.font='20px "Press Start 2P"';
  ctx.fillText(g,W/2,H/2+46);

  if(Math.floor(Date.now()/500)%2===0){
    ctx.fillStyle=C.gold;
    ctx.font='6px "Press Start 2P"';
    ctx.fillText('PRESS ENTER',W/2,H/2+68);
  }
  ctx.textAlign='left';
}

// ── Main loop ───────────────────────────────────────────────
function frame(ts){
  const dt = Math.min((ts-lastTime)/1000, 0.05);
  lastTime = ts;
  update(dt);

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#08111e';
  ctx.fillRect(0,0,W,H);

  drawBleachers();
  drawRink();
  drawTrail();
  drawSkater();
  drawSparkles();
  drawPopups();
  drawTimerFlash();

  if(gameState==='gameover') drawGameOver();

  requestAnimationFrame(frame);
}

// ── Game end ────────────────────────────────────────────────
function endGame(){
  gameState = 'gameover';
  // update save
  if(saveData){
    const medal = score>=5000?'gold':score>=2500?'silver':score>=1000?'bronze':null;
    if(medal) SaveSystem.addMedal(slot,medal);
    const d = SaveSystem.load(slot);
    if(d){ d.season=(d.season||1)+1; SaveSystem.save(slot,d); }
  }
  document.addEventListener('keydown', e=>{
    if(e.code==='Enter'||e.code==='Space') location.href='career.html';
  },{once:true});
}

// ── Mobile buttons ──────────────────────────────────────────
function setupMobileButtons(){
  const btnStyle=(extra)=>`
    position:absolute;
    font-family:'Press Start 2P',monospace;
    font-size:8px;
    background:rgba(10,20,40,0.85);
    color:#4ac8f0;
    border:2px solid #4ac8f0;
    padding:7px 10px;
    cursor:pointer;
    z-index:30;
    touch-action:manipulation;
    user-select:none;
    ${extra}
  `;

  const wrap = document.querySelector('.game-page');
  if(!wrap) return;

  let li, ri;
  const makeBtn=(lbl,style,down,up)=>{
    const b=document.createElement('button');
    b.textContent=lbl;
    b.style.cssText=style;
    if(down) b.addEventListener('touchstart',e=>{e.preventDefault();down();});
    if(up)   b.addEventListener('touchend',e=>{e.preventDefault();up&&up();});
    if(down) b.addEventListener('mousedown',e=>{e.preventDefault();down();});
    if(up)   b.addEventListener('mouseup',e=>{e.preventDefault();up&&up();});
    wrap.appendChild(b);
  };

  makeBtn('◀',btnStyle('bottom:42px;left:8px;'),
    ()=>{ li=setInterval(()=>{sk.vx=-1.6;sk.facing=-1;},16); },
    ()=>{ clearInterval(li);sk.vx*=0.2; }
  );
  makeBtn('▶',btnStyle('bottom:42px;left:60px;'),
    ()=>{ ri=setInterval(()=>{sk.vx=1.6;sk.facing=1;},16); },
    ()=>{ clearInterval(ri);sk.vx*=0.2; }
  );
  makeBtn('Z\nJUMP',btnStyle('bottom:42px;right:100px;white-space:pre;'),
    ()=>{ if(sk.grounded&&!sk.jumping&&gameState==='playing') doJump(); }
  );
  makeBtn('X\nSPIN',btnStyle('bottom:42px;right:50px;white-space:pre;'),
    ()=>{ if(!sk.spinning&&gameState==='playing') doSpin(); }
  );
  makeBtn('★\nPOSE',btnStyle('bottom:42px;right:4px;white-space:pre;'),
    ()=>{ if(sk.grounded&&!sk.posing&&gameState==='playing') doPose(); }
  );
}

// ── Init ───────────────────────────────────────────────────
function init(){
  slot = parseInt(sessionStorage.getItem('activeSlot')||'1');
  saveData = SaveSystem.load(slot);
  if(!saveData){ location.href='career.html'; return; }

  // Apply skater appearance
  const s = saveData.skater;
  sk.skin   = s.skin   ?? 1;
  sk.hair   = s.hair   ?? 4;
  sk.outfit = s.outfit ?? 0;
  sk.gender = s.gender ?? 'female';

  setupMobileButtons();
  updateHUD();
  requestAnimationFrame(ts=>{ lastTime=ts; requestAnimationFrame(frame); });
}

// Run after DOM ready
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
} else { init(); }

window.GameEngine = { doJump, doSpin, doPose };
})();
