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
const becomeCpuPath = 'arcade-parts/become-local-cpu-03.txt';
const apiPath = 'api/become-scenario.js';
const required = [
  'index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll','.env.example',
  roleLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,becomeCpuPath,apiPath,
  'tests/role-drift.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'
];
for (const path of required) assert.ok(exists(path), `${path} must exist`);

const baseSource = basePaths.map(read).join('');
const roleLogicSource = read(roleLogicPath);
const perceiveSource = perceivePaths.map(read).join('');
const becomeCoreSource = read(becomeCorePath);
const becomeLiveSource = read(becomeLivePath);
const becomeCpuSource = read(becomeCpuPath);
const apiSource = read(apiPath);
const loader = read('arcade.js');
const index = read('index.html');
const readme = read('README.md');
const workflow = read('.github/workflows/validate-and-verify.yml');
const packageJson = JSON.parse(read('package.json'));

const closeIndex = baseSource.lastIndexOf('})();');
assert.ok(closeIndex > 0, 'shared arcade IIFE terminator must remain available');
const completeSource = `${baseSource.slice(0,closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${becomeCpuSource}\n${baseSource.slice(closeIndex)}`;
const temp = mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath = join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for (const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))]) {
  execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}

// Loader and public surface.
assert.match(loader,/VERSION = '20260825-role-drift-become-1'/);
assert.match(loader,/LIVE_VERSION = '20260826-become-local-ai-3'/);
assert.match(loader,/perceive-role-logic\.txt/);
assert.match(loader,/become-live-02\.txt/);
assert.match(loader,/become-local-cpu-03\.txt/);
assert.match(loader,/sources\.slice\(perceiveEnd\)\.join\(''\)/);
assert.match(loader,/Function\(completeSource\)\(\)/);
assert.match(index,/PARALLAX WING/);
assert.match(index,/nearest escort on the outside/i);
assert.match(index,/id="becomeLab"/);
assert.match(index,/id="becomeScreen"/);
assert.match(index,/arcade\.js\?v=20260826-become-local-ai-3/);
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

// Live Become must work with no credential via local WebGPU and retain optional Groq cloud generation.
for (const marker of [
  'DREAM MAKER · BECOME · LIVE AI','https://dream-unity-become-live.vercel.app/api/become-scenario','https://console.groq.com/keys',
  'BECOME_GROQ_SESSION_KEY','sessionStorage','X-Groq-Api-Key','GPT-OSS 120B','ZERO-CREDENTIAL LOCAL AI',
  'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm','SmolLM2-360M-Instruct-q4f32_1-MLC','navigator.gpu',
  'async function bLocalEngine','async function bLocalGenerate','function bLocalTooSimilar','bLocalJaccard','async function bGroqGenerate',
  'async function bLiveGenerate','function bLivePrefetch','bBeginSession=async function','bNext=async function','NO STORED WORLD',
  'recentScenarios','currentPerformance','dimensions'
]) assert.ok(becomeLiveSource.includes(marker),`missing Become live marker: ${marker}`);
assert.match(becomeLiveSource,/import\(BECOME_LOCAL_WEBLLM_URL\)/);
assert.match(becomeLiveSource,/engine\.chat\.completions\.create/);
assert.match(becomeLiveSource,/Array\.from\(\{length:becomeState\.count\},\(\)=>null\)/);
assert.doesNotMatch(becomeLiveSource,/bShuffle\(BECOME_SCENARIOS\)/);
assert.doesNotMatch(becomeLiveSource,/localStorage\.setItem\([^\n]*groq/i);
assert.doesNotMatch(becomeLiveSource,/A free Groq API key is required/i);

// Zero-credential compatibility fallback: Transformers.js on CPU/WASM.
for (const marker of [
  '@huggingface/transformers@4.2.0','onnx-community/SmolLM2-360M-Instruct-ONNX',"device:'wasm'", "dtype:'q4'",
  'async function bCpuPipeline','async function bCpuGenerate','function bCpuExtractText','const bLocalWebGPUGenerate = bLocalGenerate',
  'WebGPU local AI failed. Switching to CPU/WASM'
]) assert.ok(becomeCpuSource.includes(marker),`missing Become CPU fallback marker: ${marker}`);
assert.match(becomeCpuSource,/import\(BECOME_CPU_TRANSFORMERS_URL\)/);
assert.match(becomeCpuSource,/bLocalGenerate = async function/);
assert.match(becomeCpuSource,/bLocalTooSimilar\(scenario,history\)/);
assert.doesNotMatch(becomeCpuSource,/GROQ_API_KEY|X-Groq-Api-Key|localStorage/);

// Optional free Groq backend: Responses API, strict structured output, novelty rejection and CORS.
for (const marker of [
  'https://api.groq.com/openai/v1/responses','openai/gpt-oss-120b','GROQ_API_KEY','x-groq-api-key','X-Groq-Api-Key',
  "strict:true",'const MAX_ATTEMPTS = 3','function tooSimilar','jaccard','dimensionOverlap>=4','https://dream-unity.github.io',
  "provider:'groq'",'GROQ_KEY_REQUIRED','GROQ_KEY_INVALID','GROQ_RATE_LIMIT'
]) assert.ok(apiSource.includes(marker),`missing Groq backend marker: ${marker}`);
assert.doesNotMatch(apiSource,/@vercel\/oidc|api\.openai\.com|AI_GATEWAY_API_KEY|getVercelOidcToken|generateObject/);
assert.equal(packageJson.version,'1.5.0');
assert.equal(packageJson.dependencies,undefined);

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

// Documentation/deployment verification must know about every live generation layer.
assert.match(readme,/Dream Maker → BECOME/);
assert.match(readme,/controlled as-if/i);
assert.match(workflow,/become-live-02\.txt/);
assert.match(workflow,/become-local-cpu-03\.txt/);
assert.match(workflow,/dream-unity-become-live\.vercel\.app/);
assert.match(workflow,/openai\/gpt-oss-120b/);
assert.match(workflow,/provider.*groq/i);
assert.match(workflow,/SmolLM2-360M-Instruct-ONNX/);

console.log('Validated: nine portals, Relational Identity Drift, Become core training, zero-credential WebGPU + CPU/WASM local AI, optional Groq GPT-OSS and no stored live fallback.');
