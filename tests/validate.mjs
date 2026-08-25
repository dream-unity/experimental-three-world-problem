import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const exists = path => statSync(new URL(path, root)).isFile();

const basePaths = [1,2,3,4,5].map(n => `arcade-parts/part-${String(n).padStart(2,'0')}.txt`);
const causalLogicPath = 'arcade-parts/perceive-role-logic.txt';
const perceivePaths = [1,2,3,4,5,6,7,8].map(n => `arcade-parts/perceive-aerial-${String(n).padStart(2,'0')}.txt`);
const becomeCorePath = 'arcade-parts/become-lab-01.txt';
const becomeLivePath = 'arcade-parts/become-live-02.txt';
const apiPath = 'api/become-scenario.js';
const required = [
  'index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll','.env.example',
  causalLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,apiPath,
  'tests/causal-weave.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'
];
for (const path of required) assert.ok(exists(path), `${path} must exist`);

const baseSource = basePaths.map(read).join('');
const causalLogicSource = read(causalLogicPath);
const perceiveSource = perceivePaths.map(read).join('');
const becomeCoreSource = read(becomeCorePath);
const becomeLiveSource = read(becomeLivePath);
const apiSource = read(apiPath);
const loader = read('arcade.js');
const index = read('index.html');
const readme = read('README.md');
const workflow = read('.github/workflows/validate-and-verify.yml');
const packageJson = JSON.parse(read('package.json'));

const closeIndex = baseSource.lastIndexOf('})();');
assert.ok(closeIndex > 0, 'shared arcade IIFE terminator must remain available');
const completeSource = `${baseSource.slice(0,closeIndex)}\n${causalLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${baseSource.slice(closeIndex)}`;
const temp = mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath = join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for (const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))]) {
  execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}

// Loader and public surface.
assert.match(loader,/VERSION = '20260826-causal-weave-1'/);
assert.match(loader,/LIVE_VERSION = '20260826-become-live-gpt-2'/);
assert.match(loader,/const causalLogicPath/);
assert.match(loader,/perceive-role-logic\.txt/);
assert.match(loader,/become-lab-\$\{String\(n\)\.padStart\(2, '0'\)\}\.txt/);
assert.match(loader,/become-live-02\.txt/);
assert.match(loader,/sources\.slice\(perceiveEnd\)\.join\(''\)/);
assert.match(loader,/Function\(completeSource\)\(\)/);
assert.match(index,/PARALLAX WING/);
assert.match(index,/Watch what the formation causes\. Exploit the opening\./);
assert.match(index,/id="becomeLab"/);
assert.match(index,/id="becomeScreen"/);
assert.match(index,/arcade\.js\?v=20260826-causal-weave-1/);
assert.doesNotMatch(index,/nearest escort on the outside/i);
assert.doesNotMatch(index,/SIGNAL VEIL/);

// Nine-portal compatibility remains intact.
const definitionKeys = baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g) || [];
assert.equal(definitionKeys.length,9,'shared engine must still contain exactly nine portal definitions');
for (const name of ['SIGNAL VEIL','MODEL FORGE','ORACLE GATES','VECTOR VOW','IMPULSE RUN','METAMORPH','GRAVITY FOUNDRY','LATTICE LOCK','GENESIS BLOOM']) {
  assert.match(baseSource,new RegExp(name));
}

// Dream Machine / Perceive is experiential causal comparison, not an instructed answer item.
for (const marker of [
  'function causalSegmentRelation','function causalTriangleRelation','function causalWeaveEvaluate','function causalWeaveClassifyShot',
  'line-extension-not-between','near-but-not-between','static-alignment-not-crossing','outside-triangle-not-enclosed'
]) assert.ok(causalLogicSource.includes(marker),`missing causal logic marker: ${marker}`);
for (const marker of [
  'function createPerceptionAerialGame',"GAME_BY_KEY['machine:0']",'demoKind','demonstrateShot','episodePolarity',
  "'between'","'flow'","'enclosure'",'negativeVariant','causalWeaveEvaluate','stats.withheld','late-causal-acquisition',
  'relay-for-downstream-anchor-substitution','boundary-for-enclosed-object-substitution','FIELD BROKEN','SHIELD HELD'
]) assert.ok(perceiveSource.includes(marker),`missing Perceive marker: ${marker}`);
assert.doesNotMatch(perceiveSource,/roleDriftGeometry|committedTurnSign|nearest outside escort|stale-role-perseveration/i);
assert.doesNotMatch(perceiveSource,/correctIndex|candidate\.pattern|odd[- ]one[- ]out|A\s*(?:→|->)\s*B|\bA is (?:above|below|left|right) B\b/i);

// Perceive replacement can instantiate and survive a deterministic lifecycle with a fake canvas.
const perceiveRuntime = {
  Math,Map,Set,Number,String,Array,Object,JSON,Date,performance,
  localStorage:{getItem(){return null;},setItem(){}},
};
vm.createContext(perceiveRuntime);
const perceivePrelude = `
  const TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
  const rand=(a=1,b=0)=>b+Math.random()*(a-b);
  const choose=arr=>arr[(Math.random()*arr.length)|0];
  const dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
  const rgba=(rgb,alpha)=>'rgba('+rgb.join(',')+','+alpha+')';
  const coarse=false; const lowCPU=false;
  const GAME_BY_KEY={'machine:0':{}};
`;
vm.runInContext(`${perceivePrelude}\n${causalLogicSource}\n${perceiveSource}\nthis.definition=GAME_BY_KEY['machine:0'];`,perceiveRuntime);
assert.equal(perceiveRuntime.definition.id,'parallax-wing-causal-weave');
const perceiveGame = perceiveRuntime.definition.factory();
const perceiveEvents = [];
const PE = {
  w:1280,h:720,u:720,top:76,bottom:692,t:0,rgb:[70,220,255],secondary:[184,126,255],keys:new Set(),
  toast(...args){perceiveEvents.push(['toast',...args]);},setMetric(...args){perceiveEvents.push(['metric',...args]);},
  shake(){},flash(){},burst(){},sfx(){},end(...args){perceiveEvents.push(['end',...args]);},addScore(){},
  level(...args){perceiveEvents.push(['level',...args]);},glow(){},line(){},
};
const gradient = {addColorStop(){}};
const fakeCanvas = new Proxy({createRadialGradient(){return gradient;}},{
  get(target,property){if(property in target)return target[property];return ()=>{};},
  set(target,property,value){target[property]=value;return true;},
});
perceiveGame.reset(PE);
for (let frame=0; frame<900; frame++) {
  PE.t=frame/60;
  perceiveGame.update(PE,1/60);
  perceiveGame.draw(PE,fakeCanvas);
  if(frame===470){perceiveGame.pointerDown(PE,640,270);perceiveGame.pointerUp(PE);}
  if(frame===650)perceiveGame.keyDown(PE,' ');
}
perceiveGame.resize(PE);
perceiveGame.ambient(PE,0.1);
assert.ok(perceiveEvents.some(([type])=>type==='metric'));
assert.ok(perceiveEvents.some(([type])=>type==='toast'),'embodied episode lifecycle must advance beyond initial reset');

// Become core training machinery is preserved.
for (const marker of [
  'function createBecomeLab',"GAME_BY_KEY['maker:2']",'const BECOME_SECONDS = 10','const BECOME_ENTRY_SECONDS = 30',
  'BECOME_DRILLS','BECOME_TRANSFER_DRILLS','SENSORY PRESENCE','SPATIAL EMBODIMENT','IDENTITY INHABITATION','EXIT CONTROL',
  'STATE-ENTRY LATENCY','Personal text was not written to performance history'
]) assert.ok(becomeCoreSource.includes(marker),`missing Become core marker: ${marker}`);
assert.doesNotMatch(becomeCoreSource,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);

// Live director overrides only scenario sourcing and never pretends a stored world is live.
for (const marker of [
  'DREAM MAKER · BECOME · LIVE GPT','https://dream-unity-become-live.vercel.app/api/become-scenario','function bLiveValidateScenario',
  'async function bLiveGenerate','function bLivePrefetch','bBeginSession = async function','bNext = async function','NOT A SCENARIO BANK',
  'NO STORED WORLD','recentScenarios','currentPerformance','dimensions'
]) assert.ok(becomeLiveSource.includes(marker),`missing Become live marker: ${marker}`);
assert.match(becomeLiveSource,/fetch\(BECOME_LIVE_API/);
assert.match(becomeLiveSource,/Array\.from\(\{length:becomeState\.count\},\(\)=>null\)/);
assert.doesNotMatch(becomeLiveSource,/bShuffle\(BECOME_SCENARIOS\)/);

// Secure Vercel backend: OIDC, structured generation, novelty rejection and CORS.
for (const marker of [
  'generateObject','@vercel/oidc','getVercelOidcToken','openai/gpt-5.6-sol','const MAX_ATTEMPTS = 3',
  'function tooSimilar','jaccard','dimensionOverlap>=4','https://dream-unity.github.io','Live GPT hosting is configured'
]) assert.ok(apiSource.includes(marker),`missing backend marker: ${marker}`);
assert.doesNotMatch(apiSource,/OPENAI_API_KEY/);
assert.doesNotMatch(apiSource,/api\.openai\.com/);
assert.equal(packageJson.dependencies?.ai,'latest');
assert.equal(packageJson.dependencies?.zod,'latest');
assert.equal(packageJson.dependencies?.['@vercel/oidc'],'latest');

// Core Become can instantiate independently; live networking is layered above it.
const classList = () => ({add(){},remove(){},contains(){return false;}});
const becomeRoot = {classList:classList(),setAttribute(){},onclick:null,onsubmit:null,onchange:null,onkeydown:null};
const becomeScreen = {innerHTML:'',scrollTop:0};
const becomeRuntime = {
  Math,Map,Set,Number,String,Array,Object,JSON,Date,
  localStorage:{getItem(){return null;},setItem(){}},navigator:{vibrate(){}},window:{addEventListener(){}},
  document:{getElementById(id){if(id==='becomeLab')return becomeRoot;if(id==='becomeScreen')return becomeScreen;return null;}},
  shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,GAME_BY_KEY:{'maker:2':{}}
};
vm.createContext(becomeRuntime);
vm.runInContext(`${becomeCoreSource}\nthis.definition=GAME_BY_KEY['maker:2'];`,becomeRuntime);
assert.equal(becomeRuntime.definition.id,'become-reality-lab');
const becomeGame = becomeRuntime.definition.factory();
becomeGame.reset({setScore(){},setMetric(){}});
assert.match(becomeScreen.innerHTML,/REALITY<br>TRAINING LAB/);

// Documentation and deployment verification know about both replacements.
assert.match(readme,/Parallax Wing — Causal Weave prototype/);
assert.match(readme,/positive and negative examples/i);
assert.match(readme,/Dream Maker → BECOME/);
assert.match(workflow,/causalSegmentRelation/);
assert.match(workflow,/causal_weave/);
assert.match(workflow,/become-live-02\.txt/);
assert.match(workflow,/dream-unity-become-live\.vercel\.app/);

console.log('Validated: nine portals, experiential Causal Weave, positive/negative relation contrast, live Become, OIDC backend and deployment surfaces.');
