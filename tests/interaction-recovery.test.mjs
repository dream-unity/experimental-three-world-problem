import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const rootPath = normalize(new URL('../', import.meta.url).pathname);
const mime = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webp':'image/webp','.txt':'text/plain; charset=utf-8' };
let server;
let baseUrl = process.env.DU_INTERACTION_BASE_URL || '';
if (!baseUrl) {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = normalize(join(rootPath, relative));
      assert.ok(file.startsWith(rootPath));
      assert.ok((await stat(file)).isFile());
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{width:1280,height:800}, reducedMotion:'no-preference' });
const page = await context.newPage();
const errors=[];
await page.addInitScript(()=>{
  try { localStorage.setItem('dream-unity-score-muted','1'); } catch {}
  window.__arcadeReady=false;
  window.addEventListener('dreamunity:arcade-ready',()=>{ window.__arcadeReady=true; });
});
page.on('console',message=>{ if(message.type()==='error') errors.push(`console: ${message.text()}`); });
page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
const url=new URL(baseUrl); url.searchParams.set('nexus-interaction',Date.now());
await page.goto(url.href,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__dreamUnityInteractions?.ready===true && window.__dreamUnityStableRotation?.accelerating===false);
await page.waitForFunction(()=>Object.values(window.__dreamUnityInteractions.screen()).every(point=>point.r>24));
await page.waitForFunction(()=>window.__arcadeReady===true);

const rig=()=>page.evaluate(()=>({
  orientation:window.__dreamUnityInteractions.orientation(),
  motion:window.__dreamUnityInteractions.motion(),
  shape:window.__dreamUnityInteractions.shape(),
  screen:window.__dreamUnityInteractions.screen(),
  integrity:window.__dreamUnityInteractions.integrity(),
}));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const shapeDelta=(a,b)=>Math.max(Math.abs(a.machineMaker-b.machineMaker),Math.abs(a.makerReality-b.makerReality),Math.abs(a.realityMachine-b.realityMachine));

await page.evaluate(()=>window.__dreamUnityInteractions.reset());
let before=await rig();
await page.waitForTimeout(700);
let after=await rig();
assert.ok(Math.abs(after.orientation.yaw-before.orientation.yaw)<0.004,'nexus rotates autonomously while untouched');
assert.ok(Math.abs(after.orientation.pitch-before.orientation.pitch)<0.004,'nexus pitch drifts autonomously');

async function drag(point,dx,dy,steps=8){ await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+dx,point.y+dy,{steps});await page.mouse.up(); }
await page.evaluate(()=>window.__dreamUnityInteractions.reset());
before=await rig();
await drag(before.screen.machine,46,27);
await page.waitForTimeout(40);
after=await rig();
assert.ok(Math.abs(after.orientation.yaw-before.orientation.yaw)+Math.abs(after.orientation.pitch-before.orientation.pitch)>0.22,'direct portal drag is not responsive');
assert.ok(['machine','maker','reality'].map(key=>distance(before.screen[key],after.screen[key])).filter(value=>value>4).length>=2,'complete nexus did not move as one form');
assert.ok(shapeDelta(before.shape,after.shape)<1e-8,'whole-form drag distorted model-space relationships');
assert.equal(after.integrity.connected,true);assert.equal(after.integrity.rigid,true);assert.equal(after.integrity.allFinite,true);

// Release motion must monotonically decay, never speed up.
const released=await rig();
await page.waitForTimeout(120);const t1=await rig();
await page.waitForTimeout(120);const t2=await rig();
await page.waitForTimeout(120);const t3=await rig();
const d1=Math.abs(t1.orientation.yaw-released.orientation.yaw)+Math.abs(t1.orientation.pitch-released.orientation.pitch);
const d2=Math.abs(t2.orientation.yaw-t1.orientation.yaw)+Math.abs(t2.orientation.pitch-t1.orientation.pitch);
const d3=Math.abs(t3.orientation.yaw-t2.orientation.yaw)+Math.abs(t3.orientation.pitch-t2.orientation.pitch);
assert.ok(d2<=d1+0.006 && d3<=d2+0.006,`rotation accelerated after release (${d1.toFixed(3)}, ${d2.toFixed(3)}, ${d3.toFixed(3)})`);
assert.equal(t3.motion.autonomous,false);

// Precision trackpad orbit and pinch zoom remain distinct.
await page.evaluate(()=>window.__dreamUnityInteractions.reset());
before=await rig();
await page.dispatchEvent('#world','wheel',{deltaX:28,deltaY:18,deltaMode:0});
await page.waitForTimeout(35);after=await rig();
assert.ok(Math.abs(after.orientation.yaw-before.orientation.yaw)>0.08,'trackpad horizontal orbit did not register');
assert.ok(Math.abs(after.orientation.pitch-before.orientation.pitch)>0.05,'trackpad vertical orbit did not register');
const zoomBefore=after.orientation.zoom;
await page.dispatchEvent('#world','wheel',{deltaY:-32,deltaMode:0,ctrlKey:true});
await page.waitForTimeout(25);
const zoomAfter=(await rig()).orientation.zoom;
assert.ok(Math.abs(zoomAfter-zoomBefore)>0.08,'trackpad pinch did not zoom');

// Touch follows the same whole-field transform.
await page.evaluate(()=>window.__dreamUnityInteractions.reset());
before=await rig();
await page.evaluate(({x,y})=>{
  const canvas=document.querySelector('#world');
  const event=(type,cx,cy,buttons)=>new PointerEvent(type,{pointerId:73,pointerType:'touch',isPrimary:true,clientX:cx,clientY:cy,buttons,bubbles:true,cancelable:true});
  canvas.dispatchEvent(event('pointerdown',x,y,1));
  window.dispatchEvent(event('pointermove',x+54,y+31,1));
  window.dispatchEvent(event('pointerup',x+54,y+31,0));
},before.screen.maker);
await page.waitForTimeout(40);after=await rig();
assert.ok(Math.abs(after.orientation.yaw-before.orientation.yaw)+Math.abs(after.orientation.pitch-before.orientation.pitch)>0.25,'touch whole-field drag is unresponsive');
assert.equal(after.integrity.connected,true);

// Portal focus and all nine game factories remain intact.
await page.evaluate(()=>window.__dreamUnityInteractions.reset());
await page.locator('#label-machine').click();
await page.waitForFunction(()=>document.querySelector('#app')?.classList.contains('detail'));
await page.locator('#back').click();
await page.waitForFunction(()=>!document.querySelector('#app')?.classList.contains('detail'));

const games=[
  ['machine',0,'FIGHTER JET'],['machine',1,'MODEL FORGE'],['machine',2,'ORACLE GATES'],
  ['maker',0,'VECTOR VOW'],['maker',1,'IMPULSE RUN'],['maker',2,'BECOME'],
  ['reality',0,'GRAVITY FOUNDRY'],['reality',1,'LATTICE LOCK'],['reality',2,'GENESIS BLOOM'],
];
for(const [world,index,name] of games){
  await page.evaluate(({world,index})=>window.dispatchEvent(new CustomEvent('dreamunity:launch-game',{detail:{world,index}})),{world,index});
  await page.locator('#arcade.open').waitFor();
  assert.equal((await page.locator('#gameName').textContent()).trim(),name);
  for(const id of ['gameBack','gameSound','gamePause','gameRestart']){
    const button=page.locator(`#${id}`);await button.waitFor({state:'visible'});
    const box=await button.boundingBox();assert.ok(box&&box.width>=34&&box.height>=34,`${name}: ${id} is not usable`);
  }
  await page.locator('#gameBack').click();
  await page.waitForFunction(()=>!document.querySelector('#arcade')?.classList.contains('open'));
}

assert.deepEqual(errors,[]);
await context.close();await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
console.log(`Crystal Nexus interactions validated${process.env.DU_INTERACTION_BASE_URL?' live':''}: direct whole-form control, trackpad, touch, strictly decaying inertia, portal focus and all nine games.`);
