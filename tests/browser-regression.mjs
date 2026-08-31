import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const rootPath = normalize(new URL('../', import.meta.url).pathname);
const mime = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webp':'image/webp','.txt':'text/plain; charset=utf-8' };
let server;
let baseUrl = process.env.DU_BROWSER_BASE_URL || '';
if (!baseUrl) {
  server = createServer(async (request,response)=>{
    try {
      const url=new URL(request.url,'http://127.0.0.1');
      const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=normalize(join(rootPath,relative));
      assert.ok(file.startsWith(rootPath));assert.ok((await stat(file)).isFile());
      response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      response.end(await readFile(file));
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
}

const browser=await chromium.launch({headless:true});
let passed=0;const failures=[];
async function run(name,fn){try{await fn();passed++;console.log(`PASS ${name}`);}catch(error){failures.push({name,error});console.error(`FAIL ${name}\n${error.stack||error}`);}}
async function openPage(context){
  const page=await context.newPage();const errors=[];const requests=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(()=>{try{localStorage.setItem('dream-unity-score-muted','1');}catch{} window.__arcadeReady=false;window.addEventListener('dreamunity:arcade-ready',()=>window.__arcadeReady=true);});
  const url=new URL(baseUrl);url.searchParams.set('browser-regression',`${Date.now()}-${Math.random()}`);
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__dreamUnityRenderer?.id==='crystal-nexus'&&window.__dreamUnityInteractions?.ready===true);
  await page.waitForFunction(()=>Object.values(window.__dreamUnityInteractions.screen()).every(point=>point.r>20));
  await page.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('hide'));
  return{page,errors,requests};
}
async function launch(page,world,index){
  await page.waitForFunction(()=>window.__arcadeReady===true);
  await page.evaluate(({world,index})=>window.dispatchEvent(new CustomEvent('dreamunity:launch-game',{detail:{world,index}})),{world,index});
  await page.locator('#arcade.open').waitFor();
}
async function close(page){await page.locator('#gameBack').click();await page.waitForFunction(()=>!document.querySelector('#arcade')?.classList.contains('open'));}

await run('homepage mounts the Crystal Nexus, new score, and no voice runtime',async()=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
  const{page,errors,requests}=await openPage(context);
  assert.equal(await page.locator('[data-voice-launcher],#duVoicePanel,script[src*="voice.js"],link[href*="voice.css"]').count(),0);
  assert.equal(await page.locator('audio#scoreAudio').getAttribute('src'),'./assets/dream-maker-eye.mp3');
  assert.equal(await page.evaluate(()=>window.__dreamUnityScore?.track),'Dream Maker Eye');
  assert.equal(await page.evaluate(()=>window.__dreamUnityRenderer?.referenceDriven),true);
  const canvas=await page.evaluate(()=>{const node=document.querySelector('#world');return{width:node.width,height:node.height,cssWidth:node.clientWidth,cssHeight:node.clientHeight};});
  assert.ok(canvas.width>=canvas.cssWidth*1.4&&canvas.height>=canvas.cssHeight*1.4,'canvas is not high resolution');
  const forbidden=requests.filter(url=>/voice\.(?:js|css)|realtime-session|js\.puter\.com/i.test(url));
  assert.deepEqual(forbidden,[]);
  assert.deepEqual(errors,[]);await context.close();
});

if(process.env.DU_BROWSER_SCOPE!=='voice'){
  await run('all nine games load with visible controls',async()=>{
    const context=await browser.newContext({viewport:{width:1280,height:800}});const{page,errors}=await openPage(context);
    const games=[['machine',0,'FIGHTER JET'],['machine',1,'MODEL FORGE'],['machine',2,'ORACLE GATES'],['maker',0,'VECTOR VOW'],['maker',1,'IMPULSE RUN'],['maker',2,'BECOME'],['reality',0,'GRAVITY FOUNDRY'],['reality',1,'LATTICE LOCK'],['reality',2,'GENESIS BLOOM']];
    for(const[world,index,name]of games){
      await launch(page,world,index);assert.equal((await page.locator('#gameName').textContent()).trim(),name);
      for(const id of['gameBack','gameSound','gamePause','gameRestart']){const button=page.locator(`#${id}`);await button.waitFor({state:'visible'});const box=await button.boundingBox();assert.ok(box&&box.width>=34&&box.height>=34,`${name}: ${id} too small`);}
      await close(page);
    }
    assert.deepEqual(errors,[]);await context.close();
  });

  for(const viewport of[{width:390,height:844},{width:768,height:1024},{width:1536,height:864}]){
    await run(`responsive Crystal Nexus fits ${viewport.width}x${viewport.height}`,async()=>{
      const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,deviceScaleFactor:viewport.width<500?2:1});
      const{page,errors}=await openPage(context);
      const result=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,labels:[...document.querySelectorAll('.world-label')].map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}),music:document.querySelector('#scoreControl')?.getBoundingClientRect()}));
      assert.ok(result.scrollWidth<=result.clientWidth+1);
      for(const rect of result.labels){assert.ok(rect.x>=-2&&rect.y>=-2&&rect.right<=viewport.width+2&&rect.bottom<=viewport.height+2,'portal plate clips viewport');}
      assert.ok(result.music.x>=0&&result.music.right<=viewport.width+1,'music control clips viewport');
      assert.deepEqual(errors,[]);await context.close();
    });
  }
}

await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
console.log(`Crystal Nexus browser regression: ${passed}/${passed+failures.length} passed.`);if(failures.length)process.exitCode=1;
