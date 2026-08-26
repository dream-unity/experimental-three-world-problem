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
const becomeDiversityPath='arcade-parts/become-diversity-09.txt';
const becomeSocialPath='arcade-parts/become-social-agency-10.txt';
const apiPath='api/become-scenario.js';
const required=['index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll',roleLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,becomeDiversityPath,becomeSocialPath,apiPath,'tests/role-drift.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'];
for(const path of required)assert.ok(exists(path),`${path} must exist`);

const baseSource=basePaths.map(read).join('');
const roleLogicSource=read(roleLogicPath);
const perceiveSource=perceivePaths.map(read).join('');
const becomeCoreSource=read(becomeCorePath);
const becomeLiveSource=read(becomeLivePath);
const becomeDiversitySource=read(becomeDiversityPath);
const becomeSocialSource=read(becomeSocialPath);
const apiSource=read(apiPath);
const loader=read('arcade.js');
const index=read('index.html');
const workflow=read('.github/workflows/validate-and-verify.yml');
const packageJson=JSON.parse(read('package.json'));

const closeIndex=baseSource.lastIndexOf('})();');
assert.ok(closeIndex>0,'shared arcade IIFE terminator must remain available');
const completeSource=`${baseSource.slice(0,closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${becomeDiversitySource}\n${becomeSocialSource}\n${baseSource.slice(closeIndex)}`;
const temp=mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath=join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for(const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});

// Loader and surface.
assert.match(loader,/LIVE_VERSION = '20260826-become-social-agency-10'/);
assert.match(loader,/become-social-agency-10\.txt/);
assert.ok(loader.indexOf('become-diversity-09.txt')<loader.indexOf('become-social-agency-10.txt'),'social layer must execute after world diversity');
assert.match(index,/arcade\.js\?v=20260826-become-social-agency-10/);
assert.match(index,/controlled social-agency training lab/i);
assert.match(index,/PARALLAX WING/);

// Nine portals and PERCEIVE remain intact.
const definitionKeys=baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g)||[];
assert.equal(definitionKeys.length,9,'shared engine must retain exactly nine portal definitions');
for(const marker of ['function roleDriftGeometry','function roleDriftClassifyShot','stale-role-perseveration'])assert.ok(roleLogicSource.includes(marker));
for(const marker of ['function createPerceptionAerialGame',"GAME_BY_KEY['machine:0']",'committedTurnSign','roleSwitchAt'])assert.ok(perceiveSource.includes(marker));

// Core BECOME machinery remains; social architecture changes content and prompts, not lifecycle safety.
for(const marker of ['function createBecomeLab',"GAME_BY_KEY['maker:2']",'const BECOME_SECONDS = 10','const BECOME_ENTRY_SECONDS = 30','BECOME_DRILLS','BECOME_TRANSFER_DRILLS','EXIT CONTROL','STATE-ENTRY LATENCY'])assert.ok(becomeCoreSource.includes(marker),`missing core marker: ${marker}`);
for(const marker of ['D9_WORLDS','d9Candidate','d9SigDistance','d9MemoryRead','d9MemoryWrite'])assert.ok(becomeDiversitySource.includes(marker),`missing diversity primitive: ${marker}`);

// Social-agency implementation markers.
for(const marker of [
  'S10_MEMORY_KEY','S10_PROFILES','S10_AXES','S10_COMBINED_AXES','s10SocialDistance','s10CombinedDistance',
  's10SelectCombos','s10PlanQueue','s10SchedulePrewarm','s10ConsumeQueue','social-agency-max-distance',
  'SELF —','OTHER —','ACTION —','Empathy here is model flexibility','PERSPECTIVE PLURALITY',
  'NON-PERFORMATIVE EMPATHY','AGENTIC SELF-AWARENESS','INDEPENDENT-MIND FIDELITY',
  'ALL SCENARIOS SOCIAL','NO REPEATED SOCIAL PROFILE','NO NETWORK WAIT'
])assert.ok(becomeSocialSource.includes(marker),`missing social-agency marker: ${marker}`);
assert.doesNotMatch(becomeSocialSource,/bShuffle\(BECOME_SCENARIOS\)/);

// Runtime proof with deterministic randomness and no usable network.
let seed=0x9e3779b9;
const seededMath=Object.create(Math);
seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
const storage=new Map();
const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
const classList=()=>({add(){},remove(){},contains(){return false;}});
const becomeRoot={classList:classList(),setAttribute(){},onclick:null,onsubmit:null,onchange:null,onkeydown:null};
const becomeScreen={innerHTML:'',scrollTop:0};
const windowObject={addEventListener(){}};
const runtime={
  Math:seededMath,Map,Set,Number,String,Array,Object,JSON,Date,Promise,RegExp,
  localStorage,sessionStorage:localStorage,navigator:{vibrate(){}},window:windowObject,
  document:{getElementById(id){if(id==='becomeLab')return becomeRoot;if(id==='becomeScreen')return becomeScreen;return null;}},
  shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,
  GAME_BY_KEY:{'maker:2':{}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
  performance:{now:()=>Number(process.hrtime.bigint())/1e6},
  fetch:async()=>{throw new Error('network intentionally unavailable in social-agency validation');}
};
vm.createContext(runtime);
vm.runInContext(`${completeSource}\nthis.definition=GAME_BY_KEY['maker:2'];this.drills=BECOME_DRILLS;`,runtime);
assert.equal(runtime.definition.id,'become-reality-lab');
const game=runtime.definition.factory();
game.reset({setScore(){},setMetric(){},sfx(){}});
assert.match(becomeScreen.innerHTML,/SOCIAL<br>AGENCY LAB/);

const api=runtime.window.DREAM_UNITY_BECOME_SOCIAL_AGENCY;
assert.ok(api,'social-agency diagnostics must be exposed');
assert.equal(api.profiles,40);
assert.equal(api.socialAxes,16);
assert.equal(api.combinedAxes,29);

function validateQueue(queue,label){
  assert.equal(queue.length,10,`${label} must contain ten scenarios`);
  const families=new Set(),profiles=new Set(),empathyOps=new Set(),agencyModes=new Set();
  for(const scenario of queue){
    for(const key of ['id','title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions'])assert.ok(scenario[key],`${label} missing ${key}`);
    assert.equal(scenario.__source,'social-agency-max-distance');
    assert.ok(scenario.__socialAgency?.profileId,'social profile missing');
    assert.ok(scenario.__socialSignature,'social signature missing');
    assert.notEqual(scenario.dimensions.social_structure,'solo');
    assert.match(scenario.choice,/SELF —/);
    assert.match(scenario.choice,/OTHER —/);
    assert.match(scenario.choice,/ACTION —/);
    assert.match(scenario.identity,/Empathy here is model flexibility/);
    assert.match(scenario.exit,/release every imagined certainty/i);
    families.add(scenario.__signature.family);
    profiles.add(scenario.__socialAgency.profileId);
    empathyOps.add(scenario.__socialSignature.empathyOperation);
    agencyModes.add(scenario.__socialSignature.agencyMode);
  }
  assert.equal(families.size,10,`${label} repeated a world family`);
  assert.equal(profiles.size,10,`${label} repeated a social profile`);
  assert.equal(empathyOps.size,10,`${label} repeated an empathy operation`);
  assert.equal(agencyModes.size,10,`${label} repeated an agency mode`);
  let minSocial=1,minCombined=1;
  for(let i=0;i<queue.length;i++)for(let j=i+1;j<queue.length;j++){
    minSocial=Math.min(minSocial,api.socialDistance(queue[i].__socialSignature,queue[j].__socialSignature));
    minCombined=Math.min(minCombined,api.combinedDistance(
      {baseSignature:queue[i].__signature,socialSignature:queue[i].__socialSignature},
      {baseSignature:queue[j].__signature,socialSignature:queue[j].__socialSignature}
    ));
  }
  assert.ok(minSocial>=0.72,`${label} social min-distance too low: ${minSocial}`);
  assert.ok(minCombined>=0.78,`${label} combined min-distance too low: ${minCombined}`);
  return{families,profiles,minSocial,minCombined};
}

const started=performance.now();
const first=api.buildQueue(10);
const elapsed=performance.now()-started;
const firstStats=validateQueue(first,'first session');
assert.ok(elapsed<1000,`ten social scenarios took too long: ${elapsed.toFixed(1)}ms`);
const second=api.buildQueue(10);
const secondStats=validateQueue(second,'second session');
assert.equal([...firstStats.families].filter(x=>secondStats.families.has(x)).length,0,'immediate next session repeated world families');
assert.equal([...firstStats.profiles].filter(x=>secondStats.profiles.has(x)).length,0,'immediate next session repeated social profiles');

const metricById=Object.fromEntries(runtime.drills.map(metric=>[metric.id,metric]));
assert.equal(metricById.agency.title,'RELATIONAL AGENCY');
assert.equal(metricById.authenticity.title,'NON-PERFORMATIVE EMPATHY');
assert.equal(metricById.identity.title,'AGENTIC SELF-AWARENESS');
assert.equal(metricById.integrated.title,'MULTI-PERSPECTIVE INTEGRATION');

for(const value of storage.values()){
  assert.doesNotMatch(value,/CURRENT SITUATION|CONCRETE SUCCESS POINT|NEXT PHYSICAL ACTION/);
}

assert.match(workflow,/become-social-agency-10\.txt/);
assert.equal(packageJson.version,'1.6.0');
assert.equal(packageJson.dependencies,undefined);
console.log(`Validated: 40 social architectures, 29 combined novelty axes, 10 scenarios in ${elapsed.toFixed(1)}ms, social min ${firstStats.minSocial.toFixed(3)}, combined min ${firstStats.minCombined.toFixed(3)}, zero immediate cross-session repeats.`);
