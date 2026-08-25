import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const exists=path=>statSync(new URL(path,root)).isFile();
const basePaths=[1,2,3,4,5].map(n=>`arcade-parts/part-${String(n).padStart(2,'0')}.txt`);
const roleLogicPath='arcade-parts/perceive-role-logic.txt';
const perceivePaths=[1,2,3,4,5,6,7,8].map(n=>`arcade-parts/perceive-aerial-${String(n).padStart(2,'0')}.txt`);
const becomeCorePath='arcade-parts/become-lab-01.txt';
const becomeLivePath='arcade-parts/become-live-02.txt';
const apiPath='api/become-scenario.js';
for(const path of ['index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll',roleLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,apiPath,'tests/role-drift.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'])assert.ok(exists(path),`${path} must exist`);

const baseSource=basePaths.map(read).join('');
const roleLogicSource=read(roleLogicPath);
const perceiveSource=perceivePaths.map(read).join('');
const becomeCoreSource=read(becomeCorePath);
const becomeLiveSource=read(becomeLivePath);
const apiSource=read(apiPath);
const loader=read('arcade.js');
const index=read('index.html');
const workflow=read('.github/workflows/validate-and-verify.yml');
const packageJson=JSON.parse(read('package.json'));

const closeIndex=baseSource.lastIndexOf('})();');
assert.ok(closeIndex>0);
const completeSource=`${baseSource.slice(0,closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${baseSource.slice(closeIndex)}`;
const temp=mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath=join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for(const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});

assert.match(loader,/LIVE_VERSION = '20260826-become-guaranteed-generation-8'/);
assert.match(index,/arcade\.js\?v=20260826-become-guaranteed-generation-8/);
assert.match(index,/id="becomeLab"/);
const definitionKeys=baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g)||[];
assert.equal(definitionKeys.length,9);
for(const marker of ['function roleDriftGeometry','function roleDriftClassifyShot','stale-role-perseveration'])assert.ok(roleLogicSource.includes(marker));
for(const marker of ['function createPerceptionAerialGame',"GAME_BY_KEY['machine:0']",'committedTurnSign','roleSwitchAt'])assert.ok(perceiveSource.includes(marker));
for(const marker of ['function createBecomeLab',"GAME_BY_KEY['maker:2']",'const BECOME_SECONDS = 10','const BECOME_ENTRY_SECONDS = 30','BECOME_DRILLS','BECOME_TRANSFER_DRILLS','EXIT CONTROL','STATE-ENTRY LATENCY'])assert.ok(becomeCoreSource.includes(marker));
assert.doesNotMatch(becomeCoreSource,/\bfetch\s*\(/);

for(const marker of [
  'BECOME_BROWSER_TIMEOUT_MS = 12_000','BECOME_CLOUD_COOLDOWN_MS = 180_000','BECOME_SYNTHESIS_KITS',
  'function bSynthGenerate','function bSynthTooSimilar',"source:'generative-synthesis'",'CLOUD AI FIRST','SYNTHESIS BACKUP',
  'NO PREWRITTEN WORLD FALLBACK','async function bCloudGenerate','async function bLiveGenerate','becomeCloudCooldownUntil',
  'bSynthGenerate(index)','function bLivePrefetch','bBeginSession=async function','bNext=async function'
])assert.ok(becomeLiveSource.includes(marker),`missing guaranteed-generation marker: ${marker}`);
assert.doesNotMatch(becomeLiveSource,/bShuffle\(BECOME_SCENARIOS\)/);
assert.match(becomeLiveSource,/fetch\(BECOME_LIVE_API/);

for(const marker of [
  'https://blockrun.ai/api/v1/chat/completions',"const MODEL = 'nvidia/gpt-oss-120b'",'const REQUEST_TIMEOUT_MS = 20_000',
  'const MAX_ATTEMPTS = 2','max_tokens:650',"response_format:{type:'json_object'}",'upstreamFailover:\'blockrun-managed\'',
  'function tooSimilar','latencyMs:generated.latencyMs'
])assert.ok(apiSource.includes(marker),`missing bounded cloud marker: ${marker}`);
assert.doesNotMatch(apiSource,/async function callWithFailover|nvidia\/step-3\.7-flash|nvidia\/mistral-nemotron/);

// Runtime proof: with no network involved, synthesis must still create a complete new world.
const classList=()=>({add(){},remove(){},contains(){return false;}});
const becomeRoot={classList:classList(),setAttribute(){},onclick:null,onsubmit:null,onchange:null,onkeydown:null};
const becomeScreen={innerHTML:'',scrollTop:0};
const runtime={
  Math,Map,Set,Number,String,Array,Object,JSON,Date,Promise,
  localStorage:{getItem(){return null;},setItem(){}},
  navigator:{vibrate(){}},
  window:{addEventListener(){}},
  document:{getElementById(id){if(id==='becomeLab')return becomeRoot;if(id==='becomeScreen')return becomeScreen;return null;}},
  shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,
  GAME_BY_KEY:{'maker:2':{}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
  fetch:async()=>{throw new Error('network intentionally unavailable in synthesis test');}
};
vm.createContext(runtime);
vm.runInContext(`${becomeCoreSource}\n${becomeLiveSource}\nthis.synth=bSynthGenerate;this.state=becomeState;this.definition=GAME_BY_KEY['maker:2'];`,runtime);
assert.equal(runtime.definition.id,'become-reality-lab');
runtime.state.count=3;
runtime.state.queue=[null,null,null];
const generated=[];
for(let i=0;i<3;i++){
  const scenario=runtime.synth(i);
  generated.push(scenario);
  runtime.state.queue[i]=scenario;
  assert.equal(scenario.source,'generative-synthesis');
  for(const key of ['id','title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions'])assert.ok(scenario[key],`synthesis missing ${key}`);
  for(const key of ['environment','role','goal','pressure','body_dynamics','decision_structure','emotional_tone','social_structure'])assert.ok(scenario.dimensions[key],`synthesis missing dimension ${key}`);
}
assert.equal(new Set(generated.map(s=>s.id)).size,3);
assert.ok(new Set(generated.map(s=>s.dimensions.environment.split(':')[0])).size>=2,'three generated worlds should span multiple environment families');

assert.match(workflow,/become-live-02\.txt/);
assert.equal(packageJson.version,'1.6.0');
assert.equal(packageJson.dependencies,undefined);
console.log('Validated: nine portals, bounded cloud generation, and guaranteed non-prewritten Become synthesis fallback.');
