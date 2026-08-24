(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const canvas = $('#world');
  const loading = $('#loading');
  const app = $('#app');
  const back = $('#back');
  const detailNumber = $('#detailNumber');
  const detailName = $('#detailName');
  const unityLabel = $('#unityLabel');
  const hint = $('#hint');
  const labels = {
    machine: $('#label-machine'),
    maker: $('#label-maker'),
    reality: $('#label-reality')
  };
  const subLabels = [$('#sub-0'), $('#sub-1'), $('#sub-2')];

  const releaseLoader = () => loading?.classList.add('hide');
  setTimeout(releaseLoader, 120);

  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) {
    releaseLoader();
    if (hint) hint.textContent = 'GRAPHICS UNAVAILABLE';
    return;
  }

  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowCPU = (navigator.hardwareConcurrency || 8) <= 6;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  const WORLD = {
    machine: { index: '01', name: 'DREAM MACHINE', css: '#39d7ff', rgb: [57, 215, 255], triad: ['PERCEIVE', 'MODEL', 'PREDICT'] },
    maker: { index: '02', name: 'DREAM MAKER', css: '#62efa5', rgb: [98, 239, 165], triad: ['INTEND', 'ACT', 'BECOME'] },
    reality: { index: '03', name: 'DREAM WORLD', css: '#bd7cff', rgb: [189, 124, 255], triad: ['MATTER', 'STRUCTURE', 'EMERGE'] }
  };
  const keys = ['machine', 'maker', 'reality'];

  let width = 1, height = 1, dpr = 1, unit = 1;
  let time = 0, last = performance.now(), frame = 0;
  let active = null, viewMix = 0, targetMix = 0;
  let yaw = 0, pitch = 0, zoom = 1;
  let dragging = false, dragX = 0, dragY = 0, dragTravel = 0;
  let hoverWorld = null, hoverSub = -1;
  let activeSub = 0, activeSubUntil = 0, impulse = 0;
  let fpsFrames = 0, fpsTime = 0, slowWindows = 0;
  let labelTick = 0;

  const worldScreen = {
    machine: { x: 0, y: 0, r: 0 }, maker: { x: 0, y: 0, r: 0 }, reality: { x: 0, y: 0, r: 0 }
  };
  const subScreen = [{x:0,y:0,r:0},{x:0,y:0,r:0},{x:0,y:0,r:0}];

  const stars = [];
  const starCount = coarse || lowCPU ? 520 : 900;
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: (Math.random() * 2 - 1) * 13,
      y: (Math.random() * 2 - 1) * 8,
      z: Math.random() * 18 - 6,
      a: .15 + Math.random() * .7,
      s: .35 + Math.random() * 1.4,
      tint: i % 7
    });
  }

  const machineNodes = [];
  for (let i = 0; i < 62; i++) {
    const phi = Math.acos(1 - 2 * (i + .5) / 62);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 2 + .16 * Math.sin(i * 1.73);
    machineNodes.push({ x: Math.cos(theta) * Math.sin(phi) * r, y: Math.cos(phi) * r, z: Math.sin(theta) * Math.sin(phi) * r });
  }
  const makerShards = [];
  for (let i = 0; i < 88; i++) {
    const a = i / 88 * TAU * 4.4;
    const r = .75 + (i % 13) * .11;
    makerShards.push({ a, r, y: Math.sin(a * 1.7) * 1.1, z: Math.cos(a * .73) * 1.3, s: .5 + (i % 6) * .1 });
  }
  const realityCells = [];
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) realityCells.push({ x: x * .57, z: z * .57, phase: (x * 7 + z * 3) * .41 });

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    unit = Math.min(width, height);
    const cap = coarse || lowCPU ? 1.05 : 1.3;
    dpr = Math.min(devicePixelRatio || 1, cap);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
  function rotate3(p, ry, rx) {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;
    return { x: x1, y: p.y * cx - z1 * sx, z: p.y * sx + z1 * cx };
  }
  function project(p, scale = 1, cameraZ = 9.4) {
    const z = cameraZ - p.z;
    const f = scale * cameraZ / Math.max(2.5, z);
    return { x: width * .5 + p.x * unit * .085 * f, y: height * .5 - p.y * unit * .085 * f, f, z };
  }

  function drawBackground(t) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, width, height);

    const nebulae = [
      [width*.22, height*.28, unit*.46, WORLD.machine.rgb, .10],
      [width*.78, height*.28, unit*.44, WORLD.maker.rgb, .075],
      [width*.51, height*.78, unit*.43, WORLD.reality.rgb, .07]
    ];
    nebulae.forEach(([x,y,r,c,a]) => {
      const g = ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0, rgba(c,a)); g.addColorStop(.42,rgba(c,a*.36)); g.addColorStop(1,rgba(c,0));
      ctx.fillStyle = g; ctx.fillRect(x-r,y-r,r*2,r*2);
    });

    const rot = t * .004;
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      const x = st.x*c - st.z*s, z = st.x*s + st.z*c;
      const p = project({x,y:st.y,z}, .74, 15);
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue;
      const tw = .45 + .55 * Math.sin(t * (.6 + (i%5)*.08) + i * .91) ** 2;
      const alpha = st.a * tw;
      const tint = st.tint === 0 ? [120,220,255] : st.tint === 1 ? [190,150,255] : st.tint === 2 ? [130,255,190] : [230,235,255];
      ctx.fillStyle = rgba(tint, alpha);
      const r = st.s * clamp(p.f, .45, 1.6);
      ctx.fillRect(p.x, p.y, r, r);
    }
  }

  function drawCurve(a, b, rgb, alpha, seed, t, packets = true) {
    const mx = (a.x + b.x) * .5 + Math.sin(t*.43 + seed) * unit*.025;
    const my = (a.y + b.y) * .5 - unit*.045 + Math.cos(t*.37 + seed) * unit*.02;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(rgb, alpha*.36);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(mx,my,b.x,b.y); ctx.stroke();
    ctx.lineWidth = .35;
    ctx.strokeStyle = rgba(rgb, alpha*.5);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(mx,my,b.x,b.y); ctx.stroke();
    if (!packets) return;
    for (let j = 0; j < 3; j++) {
      const u = (t*.055 + seed*.07 + j/3) % 1;
      const one = 1-u;
      const x = one*one*a.x + 2*one*u*mx + u*u*b.x;
      const y = one*one*a.y + 2*one*u*my + u*u*b.y;
      const r = 1.5 + 2.2*Math.sin(u*Math.PI);
      const g = ctx.createRadialGradient(x,y,0,x,y,r*4);
      g.addColorStop(0, rgba(rgb, alpha*.85)); g.addColorStop(1, rgba(rgb,0));
      ctx.fillStyle=g; ctx.fillRect(x-r*4,y-r*4,r*8,r*8);
    }
  }

  function drawOrb(x, y, r, cfg, kind, t, alpha = 1, focus = 0) {
    if (alpha <= .002 || r <= 1) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const glowR = r * (2.05 + focus*.25);
    let g = ctx.createRadialGradient(x,y,0,x,y,glowR);
    g.addColorStop(0, rgba(cfg.rgb,.38)); g.addColorStop(.25,rgba(cfg.rgb,.18)); g.addColorStop(1,rgba(cfg.rgb,0));
    ctx.fillStyle=g; ctx.fillRect(x-glowR,y-glowR,glowR*2,glowR*2);

    g = ctx.createRadialGradient(x-r*.24,y-r*.28,r*.03,x,y,r);
    g.addColorStop(0,'rgba(255,255,255,.96)');
    g.addColorStop(.18,rgba(cfg.rgb,.88));
    g.addColorStop(.58,rgba(cfg.rgb,.34));
    g.addColorStop(1,rgba(cfg.rgb,.045));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();

    ctx.strokeStyle = rgba(cfg.rgb,.48); ctx.lineWidth = Math.max(.7,r*.008);
    for (let i=0;i<3;i++) {
      const rr = r*(1.15+i*.23);
      ctx.save(); ctx.translate(x,y); ctx.rotate(t*(.08+i*.025)+(kind==='maker'?i*.65:i*.4));
      ctx.scale(1,.35+i*.12);
      ctx.beginPath(); ctx.arc(0,0,rr,0,TAU); ctx.stroke(); ctx.restore();
    }

    if (kind === 'machine') {
      ctx.strokeStyle=rgba([205,248,255],.42); ctx.lineWidth=.8;
      for(let i=0;i<9;i++){
        const a=t*.12+i*TAU/9; const x1=x+Math.cos(a)*r*.32, y1=y+Math.sin(a*1.37)*r*.26;
        const x2=x+Math.cos(a+1.9)*r*.68, y2=y+Math.sin(a*1.17+1.2)*r*.58;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      }
    } else if (kind === 'maker') {
      ctx.strokeStyle=rgba([220,255,235],.52); ctx.lineWidth=1;
      ctx.beginPath();
      for(let i=0;i<=40;i++){
        const a=i/40*TAU*2+t*.22, rr=r*(.13+.011*i);
        const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr*.55;
        i?ctx.lineTo(px,py):ctx.moveTo(px,py);
      }ctx.stroke();
    } else {
      ctx.strokeStyle=rgba([235,215,255],.4);ctx.lineWidth=.75;
      for(let i=-2;i<=2;i++){
        ctx.beginPath();ctx.moveTo(x-r*.55,y+i*r*.18);ctx.lineTo(x+r*.55,y+i*r*.18);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+i*r*.18,y-r*.55);ctx.lineTo(x+i*r*.18,y+r*.55);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function overviewPositions(t) {
    const portrait = height > width * 1.15;
    const base = portrait ? {
      machine:{x:-2.45,y:2.25,z:.0}, maker:{x:2.45,y:2.25,z:.0}, reality:{x:0,y:-3.0,z:.1}
    } : {
      machine:{x:-4.15,y:1.5,z:.0}, maker:{x:4.15,y:1.5,z:.0}, reality:{x:0,y:-3.15,z:.12}
    };
    const ang = reduced ? 0 : t*.018;
    const out={};
    keys.forEach((k,i)=>{
      const p=base[k]; const wobble=.08*Math.sin(t*.38+i*2.2);
      const q=rotate3({x:p.x,y:p.y+wobble,z:p.z},ang,Math.sin(t*.013)*.025);
      const pr=project(q,1,12.3);
      out[k]={x:pr.x,y:pr.y,r:unit*(portrait?.095:.102)*pr.f};
    });
    return out;
  }

  function drawOverview(t, alpha) {
    const pos=overviewPositions(t);
    Object.assign(worldScreen.machine,pos.machine);Object.assign(worldScreen.maker,pos.maker);Object.assign(worldScreen.reality,pos.reality);
    const unity={x:width*.5,y:height*.5,r:unit*.022};
    const pairs=[['machine','maker'],['maker','reality'],['reality','machine']];
    pairs.forEach((p,i)=>drawCurve(pos[p[0]],pos[p[1]],WORLD[p[0]].rgb,alpha*.7,i+1,t));
    keys.forEach((k,i)=>drawCurve(unity,pos[k],WORLD[k].rgb,alpha*.9,5+i,t));

    ctx.globalCompositeOperation='lighter';
    const ur=unit*.075;
    let g=ctx.createRadialGradient(unity.x,unity.y,0,unity.x,unity.y,ur);
    g.addColorStop(0,'rgba(255,245,205,.95)');g.addColorStop(.18,'rgba(255,220,140,.45)');g.addColorStop(1,'rgba(255,220,140,0)');
    ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(unity.x-ur,unity.y-ur,ur*2,ur*2);
    ctx.strokeStyle=`rgba(255,230,175,${.3*alpha})`;ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(unity.x,unity.y,unit*.055,unit*.017,t*.08,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.ellipse(unity.x,unity.y,unit*.072,unit*.024,-t*.06,0,TAU);ctx.stroke();

    keys.forEach((k)=>drawOrb(pos[k].x,pos[k].y,pos[k].r,WORLD[k],k,t,alpha,hoverWorld===k?1:0));
    ctx.globalAlpha=1;
  }

  function detailPoints(t) {
    const base=[{x:0,y:2.45,z:.2},{x:-2.18,y:-1.25,z:.1},{x:2.18,y:-1.25,z:-.1}];
    return base.map((p,i)=>{
      const q=rotate3(p,yaw+(reduced?0:t*.038),pitch);
      const pr=project(q,zoom,10.5);
      return {x:pr.x,y:pr.y,r:unit*.062*pr.f,index:i,z:q.z};
    });
  }

  function drawMachineField(t, alpha) {
    const pts=[];
    const ry=yaw+t*.055, rx=pitch+t*.012;
    for(let i=0;i<machineNodes.length;i++){
      const q=rotate3(machineNodes[i],ry,rx); const pr=project(q,zoom*.78,11); pts.push(pr);
    }
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;
    ctx.strokeStyle=rgba(WORLD.machine.rgb,.115);ctx.lineWidth=.65;
    for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+7)%pts.length],c=pts[(i+17)%pts.length];
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    }
    ctx.fillStyle='rgba(190,247,255,.6)';
    for(let i=0;i<pts.length;i++){const p=pts[i];const r=(i%9===0?1.8:.85)*clamp(p.f,.5,1.6);ctx.fillRect(p.x-r*.5,p.y-r*.5,r,r);}
  }

  function drawMakerField(t, alpha) {
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;
    for(let i=0;i<makerShards.length;i++){
      const s=makerShards[i];const a=s.a+t*(.08+(i%5)*.004);const q=rotate3({x:Math.cos(a)*s.r,y:s.y*Math.cos(t*.18+i*.1),z:Math.sin(a)*s.r+s.z*.22},yaw,pitch);
      const p=project(q,zoom*.74,11);const rr=(1.1+s.s)*clamp(p.f,.5,1.5);
      ctx.fillStyle=rgba(WORLD.maker.rgb,.16+.24*((i%7)/7));
      ctx.beginPath();ctx.moveTo(p.x,p.y-rr*1.7);ctx.lineTo(p.x+rr,p.y+rr);ctx.lineTo(p.x-rr,p.y+rr);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle=rgba(WORLD.maker.rgb,.2);ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=0;i<=90;i++){
      const a=i/90*TAU*3+t*.1; const rr=1.2+.25*Math.sin(a*2.3+t*.4); const q=rotate3({x:Math.cos(a)*rr,y:Math.sin(a*.73)*.9,z:Math.sin(a)*rr},yaw,pitch);const p=project(q,zoom*.73,11);
      i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);
    }ctx.stroke();
  }

  function drawRealityField(t, alpha) {
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;
    const pts=[];
    realityCells.forEach((cell,i)=>{
      const d=Math.hypot(cell.x,cell.z);const wave=.5+.5*Math.sin(t*1.7-d*2.2+cell.phase+activeSub*.8);const h=.18+wave*.75+impulse*Math.max(0,1-d/2.6)*.8;
      const q=rotate3({x:cell.x,y:-1.4+h,z:cell.z},yaw,pitch);const p=project(q,zoom*.72,11);pts.push({p,h,i});
    });
    pts.sort((a,b)=>b.p.z-a.p.z);
    pts.forEach(({p,h})=>{
      const rw=unit*.0065*clamp(p.f,.55,1.5),rh=unit*.035*h*clamp(p.f,.55,1.5);
      ctx.fillStyle=rgba(WORLD.reality.rgb,.12+.24*h);ctx.fillRect(p.x-rw*.5,p.y-rh,rw,rh);
      ctx.fillStyle=rgba([236,220,255],.25+.18*h);ctx.fillRect(p.x-rw*.5,p.y-rh,rw,.7);
    });
  }

  function drawDetail(t, alpha) {
    if (!active || alpha<=.002) return;
    const cfg=WORLD[active];
    ctx.globalAlpha=alpha;
    drawOrb(width*.5,height*.5,unit*.12,cfg,active,t,alpha*.5,.5);
    if(active==='machine')drawMachineField(t,alpha);
    else if(active==='maker')drawMakerField(t,alpha);
    else drawRealityField(t,alpha);

    const pts=detailPoints(t); pts.forEach((p,i)=>Object.assign(subScreen[i],p));
    for(let i=0;i<3;i++) drawCurve(pts[i],pts[(i+1)%3],cfg.rgb,alpha*.9,20+i,t);

    const cycle=((t*.2)%3); const edge=Math.floor(cycle); const u=cycle-edge; const A=pts[edge],B=pts[(edge+1)%3];
    const px=lerp(A.x,B.x,u),py=lerp(A.y,B.y,u)-Math.sin(u*Math.PI)*unit*.025;
    const pg=ctx.createRadialGradient(px,py,0,px,py,unit*.025);pg.addColorStop(0,'rgba(255,255,255,.9)');pg.addColorStop(.18,rgba(cfg.rgb,.7));pg.addColorStop(1,rgba(cfg.rgb,0));ctx.fillStyle=pg;ctx.fillRect(px-unit*.025,py-unit*.025,unit*.05,unit*.05);

    pts.forEach((p,i)=>{
      const selected=i===activeSub; const hover=i===hoverSub;
      const pulse=selected?(.5+.5*Math.sin(t*2.6+i)):0;
      const r=p.r*(1+(selected?.08:0)+(hover?.12:0)+impulse*(selected?.2:0));
      drawOrb(p.x,p.y,r,cfg,active,t+i*.6,alpha,selected||hover?1:0);
      if(selected){ctx.strokeStyle=rgba([255,255,255],alpha*(.24+.18*pulse));ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,r*1.5,0,TAU);ctx.stroke();}
    });
    ctx.globalAlpha=1;
  }

  function updateLabels() {
    if (++labelTick % 2) return;
    const e=ease(viewMix);
    keys.forEach(k=>{
      const el=labels[k],p=worldScreen[k];
      if(!el)return;el.style.left=`${p.x}px`;el.style.top=`${p.y-p.r*1.65}px`;el.style.opacity=String(clamp((1-e*2.1),0,1));el.style.pointerEvents=e<.25?'auto':'none';
    });
    if(unityLabel){unityLabel.style.left=`${width*.5}px`;unityLabel.style.top=`${height*.5+unit*.045}px`;unityLabel.style.opacity=String(clamp(1-e*2.2,0,1));}
    if(active&&e>.22){
      subLabels.forEach((el,i)=>{const p=subScreen[i];el.style.left=`${p.x}px`;el.style.top=`${p.y-p.r*1.55}px`;el.style.opacity=String(ease((e-.22)/.5));el.style.pointerEvents=e>.65?'auto':'none';el.classList.toggle('active',i===activeSub);});
    } else subLabels.forEach(el=>{el.style.opacity='0';el.style.pointerEvents='none';});
    app?.classList.toggle('detail',Boolean(active&&e>.05));
  }

  function enterWorld(key){
    if(!WORLD[key])return;active=key;targetMix=1;yaw=0;pitch=0;zoom=1;activeSub=0;activeSubUntil=0;impulse=.55;
    const cfg=WORLD[key];if(detailNumber)detailNumber.textContent=cfg.index;if(detailName){detailName.textContent=cfg.name;detailName.style.color=cfg.css;}
    subLabels.forEach((el,i)=>{if(!el)return;el.querySelector('strong').textContent=cfg.triad[i];el.style.color=cfg.css;});
    if(hint)hint.textContent='TAP A NODE · DRAG TO ORBIT';
  }
  function exitWorld(){targetMix=0;hoverSub=-1;if(hint)hint.textContent='TAP A WORLD';}
  function triggerSub(i){if(!active)return;activeSub=i;activeSubUntil=time+4.5;impulse=1;subLabels.forEach((el,j)=>el?.classList.toggle('active',i===j));}
  back?.addEventListener('click',exitWorld);
  Object.entries(labels).forEach(([k,el])=>el?.addEventListener('click',()=>enterWorld(k)));
  subLabels.forEach((el,i)=>el?.addEventListener('click',()=>triggerSub(i)));

  function hitTest(x,y){
    if(active&&viewMix>.58){
      let best=null,bestD=1e9;subScreen.forEach((p,i)=>{const d=Math.hypot(x-p.x,y-p.y);if(d<p.r*1.55&&d<bestD){bestD=d;best={type:'sub',i};}});return best;
    }
    let best=null,bestD=1e9;keys.forEach(k=>{const p=worldScreen[k];const d=Math.hypot(x-p.x,y-p.y);if(d<p.r*1.55&&d<bestD){bestD=d;best={type:'world',k};}});return best;
  }
  canvas.addEventListener('pointerdown',e=>{dragging=true;dragX=e.clientX;dragY=e.clientY;dragTravel=0;canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(dragging&&active&&viewMix>.7){const dx=e.clientX-dragX,dy=e.clientY-dragY;dragTravel+=Math.hypot(dx,dy);if(dragTravel>4){yaw-=dx*.0065;pitch=clamp(pitch-dy*.005,-.75,.75);}dragX=e.clientX;dragY=e.clientY;hoverSub=-1;return;}
    if(!coarse&&frame%3===0){const h=hitTest(e.clientX,e.clientY);hoverWorld=h?.type==='world'?h.k:null;hoverSub=h?.type==='sub'?h.i:-1;canvas.style.cursor=h?'pointer':'default';}
  });
  canvas.addEventListener('pointerup',e=>{dragging=false;if(dragTravel>9)return;const h=hitTest(e.clientX,e.clientY);if(h?.type==='world')enterWorld(h.k);if(h?.type==='sub')triggerSub(h.i);});
  canvas.addEventListener('pointercancel',()=>{dragging=false;});
  canvas.addEventListener('wheel',e=>{if(!active||viewMix<.65)return;e.preventDefault();zoom=clamp(zoom-e.deltaY*.0008,.82,1.28);},{passive:false});

  function render(t){
    drawBackground(t);
    const e=ease(viewMix);
    drawOverview(t,1-e);
    drawDetail(t,e);
    updateLabels();
    ctx.globalCompositeOperation='source-over';
    const vg=ctx.createRadialGradient(width*.5,height*.48,unit*.2,width*.5,height*.5,unit*.82);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.44)');ctx.fillStyle=vg;ctx.fillRect(0,0,width,height);
  }

  function governor(rawDt){
    fpsFrames++;fpsTime+=rawDt;if(fpsTime<2)return;const fps=fpsFrames/fpsTime;fpsFrames=0;fpsTime=0;
    if(fps<42)slowWindows++;else slowWindows=Math.max(0,slowWindows-1);
    if(slowWindows>=2&&dpr>.78){dpr=Math.max(.78,dpr-.12);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);slowWindows=0;}
  }

  function animate(now){
    const rawDt=Math.max(0,(now-last)/1000);last=now;const dt=Math.min(rawDt,1/30);
    if(!document.hidden)time+=reduced?dt*.22:dt;
    viewMix=damp(viewMix,targetMix,4.2,dt);
    if(targetMix===0&&viewMix<.006&&active){active=null;activeSub=0;impulse=0;}
    if(active&&activeSubUntil<time)activeSub=Math.floor(time/3.9)%3;
    impulse*=Math.exp(-dt*2.35);
    render(time);
    if(!document.hidden)governor(Math.min(rawDt,.1));
    frame++;requestAnimationFrame(animate);
  }

  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  releaseLoader();
  render(0);
  requestAnimationFrame(animate);
})();