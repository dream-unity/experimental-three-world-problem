import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const exists = path => statSync(new URL(path, root)).isFile();

const basePaths = [1,2,3,4,5].map(n => `arcade-parts/part-${String(n).padStart(2,'0')}.txt`);
const roleLogicPath = 'arcade-parts/perceive-role-logic.txt';
const perceivePaths = [1,2,3,4,5,6,7,8].map(n => `arcade-parts/perceive-aerial-${String(n).padStart(2,'0')}.txt`);
const becomeCorePath = 'arcade-parts/become-lab-01.txt';
const becomeLivePath = 'arcade-parts/become-live-02.txt';
const apiPath = 'api/become-scenario.js';
const required = [
  'index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll',
  roleLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,apiPath,
  'tests/role-drift.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'
];
for (const path of required) assert.ok(exists(path), `${path} must exist`);

const baseSource = basePaths.map(read).join('');
const roleLogicSource = read(roleLogicPath);
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
const completeSource = `${baseSource.slice(0,closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${baseSource.slice(closeIndex)}`;
const temp = mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath = join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for (const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))]) {
  execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}

// Loader and public surface.
assert.match(loader,/VERSION = '20260825-role-drift-become-1'/);
assert.match(loader,/LIVE_VERSION = '20260826-become-zero-key-proxy-6'/);
assert.match(loader,/perceive-role-logic\.txt/);
assert.match(loader,/become-live-02\.txt/);
assert.doesNotMatch(loader,/become-local-cpu-03\.txt/);
assert.match(loader,/sources\.slice\(perceiveEnd\)\.join\(''\)/);
assert.match(loader,/Function\(completeSource\)\(\)/);
assert.match(index,/PARALLAX WING/);
assert.match(index,/nearest escort on the outside/i);
assert.match(index,/id="becomeLab"/);
assert.match(index,/id="becomeScreen"/);
assert.match(index,/arcade\.js\?v=20260826-become-zero-key-proxy-6/);
assert.doesNotMatch(index,/SIGNAL VEIL/);

// Nine-portal compatibility remains intact.
const definitionKeys = baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g) || [];
assert.equal(definitionKeys.length,9,'shared engine must still contain exactly nine portal definitions');
for (const name of ['SIGNAL VEIL','MODEL FORGE','ORACLE GATES','VECTOR VOW','IMPULSE RUN','METAMORPH','GRAVITY FOUNDRY','LATTICE LOCK','GENESIS BLOOM']) {
  assert.match(baseSource,new RegExp(name));
}

// Dream Machine / Perceive remains Relational Identity Drift rather than symbolic item solving.
for (const marker of ['function roleDriftGeometry','function roleDriftClassifyShot','insideNearestId','stale-role-perseveration']) assert.ok(roleLogicSource.includes(marker));
for (const marker of ['function createPerceptionAerialGame',"GAME_BY_KEY['machine:0']",'committedTurnSign','outsideAxis','candidateDwell','roleSwitchAt','reacquisitionLatencies','late-relational-acquisition']) assert.ok(perceiveSource.includes(marker));
assert.doesNotMatch(perceiveSource,/unpaired-symmetry-break|dual-beam-intersection|topological-bridge/);
assert.doesNotMatch(perceiveSource,/correctIndex|candidate\.pattern|odd[- ]one[- ]out/i);

// Become core training machinery is preserved.
for (const marker of [
  'function createBecomeLab',"GAME_BY_KEY['maker:2']",'const BECOME_SECONDS = 10','const BECOME_ENTRY_SECONDS = 30',
  'BECOME_DRILLS','BECOME_TRANSFER_DRILLS','SENSORY PRESENCE','SPATIAL EMBODIMENT','IDENTITY INHABITATION','EXIT CONTROL',
  'STATE-ENTRY LATENCY','Personal text was not written to performance history'
]) assert.ok(becomeCoreSource.includes(marker),`missing Become core marker: ${marker}`);
assert.doesNotMatch(becomeCoreSource,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);

// Browser-side Become: zero-key, internet-only, no direct provider call and no local model.
for (const marker of [
  'DREAM MAKER · BECOME · LIVE AI','https://dream-unity-become-live.vercel.app/api/become-scenario',
  'NO API KEY','NO ACCOUNT','LIVE CLOUD','INTERNET GENERATED','NO MODEL DOWNLOAD','NO STORED FALLBACK',
  'async function bCloudGenerate','async function bLiveGenerate','function bLivePrefetch','bBeginSession=async function','bNext=async function',
  'recentScenarios','currentPerformance','dimensions','mode:\'cors\''
]) assert.ok(becomeLiveSource.includes(marker),`missing Become browser marker: ${marker}`);
assert.match(becomeLiveSource,/fetch\(BECOME_LIVE_API/);
assert.match(becomeLiveSource,/Array\.from\(\{length:becomeState\.count\},\(\)=>null\)/);
assert.doesNotMatch(becomeLiveSource,/bShuffle\(BECOME_SCENARIOS\)/);
for (const forbidden of [
  'X-Groq-Api-Key','sessionStorage','console.groq.com','api.groq.com','blockrun.ai/api/v1/chat/completions',
  '@mlc-ai/web-llm','SmolLM2-360M-Instruct','navigator.gpu','bLocalEngine','bLocalGenerate',
  '@huggingface/transformers',"device:'wasm'",'bCpuGenerate','CPU/WASM','OPTIONAL CLOUD KEY','OPTIONAL GROQ KEY'
]) assert.ok(!becomeLiveSource.includes(forbidden),`browser Become must not include ${forbidden}`);

// Remote proxy: no secret required, BlockRun inference, failover, structured validation, novelty rejection and CORS.
for (const marker of [
  'https://blockrun.ai/api/v1/chat/completions','nvidia/gpt-oss-120b','nvidia/step-3.7-flash','nvidia/mistral-nemotron',
  'credentialMode:\'none\'','accountRequired:false','localModel:false','Access-Control-Allow-Origin','https://dream-unity.github.io',
  'function tooSimilar','function jaccard','DIMENSION_KEYS','const MAX_ATTEMPTS = 3','async function callWithFailover','async function produce',
  "provider:'blockrun'",'generationNonce:randomUUID()','recentScenarios'
]) assert.ok(apiSource.includes(marker),`missing Become proxy marker: ${marker}`);
assert.match(apiSource,/fetch\(BLOCKRUN_URL/);
assert.doesNotMatch(apiSource,/GROQ_API_KEY|X-Groq-Api-Key|Authorization.*Bearer|api\.groq\.com|api\.openai\.com/);

// Core Become can still instantiate independently; live generation remains layered above it.
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

// Documentation/deployment verification must describe and actually probe the zero-key proxy.
assert.match(readme,/Dream Maker → BECOME/);
assert.match(readme,/controlled as-if/i);
assert.match(readme,/zero-key/i);
assert.match(readme,/BlockRun/i);
assert.match(readme,/proxy/i);
assert.match(workflow,/become-live-02\.txt/);
assert.doesNotMatch(workflow,/become-local-cpu-03\.txt/);
assert.match(workflow,/dream-unity-become-live\.vercel\.app\/api\/become-scenario/);
assert.match(workflow,/nvidia\/gpt-oss-120b/);
assert.match(workflow,/credentialMode/);
assert.match(workflow,/NO MODEL DOWNLOAD/);
assert.equal(packageJson.version,'1.6.0');
assert.equal(packageJson.dependencies,undefined);

console.log('Validated: nine portals, Relational Identity Drift, Become zero-key proxy generation, remote novelty rejection, and no browser model download or stored live fallback.');
