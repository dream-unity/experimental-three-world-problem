import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const exists=p=>statSync(new URL(p,root)).isFile();
const basePaths=[1,2,3,4,5].map(n=>`arcade-parts/part-${String(n).padStart(2,'0')}.txt`);
const roleLogicPath='arcade-parts/perceive-role-logic.txt';
const perceivePaths=[1,2,3,4,5,6,7,8].map(n=>`arcade-parts/perceive-aerial-${String(n).padStart(2,'0')}.txt`);
const becomeCorePath='arcade-parts/become-lab-01.txt';
const becomeLivePath='arcade-parts/become-live-02.txt';
const diversityPath='arcade-parts/become-diversity-09.txt';
const apiPath='api/become-scenario.js';
for(const p of ['index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll',roleLogicPath,...basePaths,...perceivePaths,becomeCorePath,becomeLivePath,diversityPath,apiPath,'tests/role-drift.test.mjs','tests/validate.mjs','.github/workflows/validate-and-verify.yml'])assert.ok(exists(p),`${p} must exist`);

const baseSource=basePaths.map(read).join('');
const roleLogicSource=read(roleLogicPath);
const perceiveSource=perceivePaths.map(read).join('');
const becomeCoreSource=read(becomeCorePath);
const becomeLiveSource=read(becomeLivePath);
const diversitySource=read(diversityPath);
const apiSource=read(apiPath);
const loader=read('arcade.js');
const index=read('index.html');
const workflow=read('.github/workflows/validate-and-verify.yml');
const packageJson=JSON.parse(read('package.json'));
const closeIndex=baseSource.lastIndexOf('})();');
assert.ok(closeIndex>0);
const completeSource=`${baseSource.slice(0,closeIndex)}\n${roleLogicSource}\n${perceiveSource}\n${becomeCoreSource}\n${becomeLiveSource}\n${diversitySource}\n${baseSource.slice(closeIndex)}`;
const temp=mkdtempSync(join(tmpdir(),'dream-unity-validate-'));
const completePath=join(temp,'arcade-complete.js');
writeFileSync(completePath,completeSource);
for(const p of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))])execFileSync(process.execPath,['--check',p],{stdio:'inherit'});

assert.match(loader,/LIVE_VERSION = '20260826-become-max-distance-9'/);
assert.match(loader,/become-diversity-09\.txt/);
assert.match(index,/arcade\.js\?v=20260826-become-max-distance-9/);
const definitionKeys=baseSource.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g)||[];
assert.equal(definitionKeys.length,9);
for(const marker of ['function roleDriftGeometry','stale-role-perseveration'])assert.ok(roleLogicSource.includes(marker));
for(const marker of ['function createBecomeLab',"GAME_BY_KEY['maker:2']",'const BECOME_SECONDS = 10','const BECOME_ENTRY_SECONDS = 30','BECOME_DRILLS','BECOME_TRANSFER_DRILLS'])assert.ok(becomeCoreSource.includes(marker));

for(const marker of ['D9_MEMORY_KEY','D9_AXES','D9_WEIGHTS','D9_WORLDS','D9_VARIANTS_PER_WORLD=8','function d9SigDistance','function d9Distance','function d9CandidateScore','function d9BuildDiverseQueue','MAX-DISTANCE','MAXIMIN','Only generated-world signatures'])assert.ok(diversitySource.includes(marker),`missing diversity marker: ${marker}`);
assert.doesNotMatch(diversitySource,/fetch\s*\(/);
assert.doesNotMatch(diversitySource,/bShuffle\(BECOME_SCENARIOS\)/);
assert.match(apiSource,/https:\/\/blockrun\.ai\/api\/v1\/chat\/completions/);

const classList=()=>({add(){},remove(){},contains(){return false;}});
const becomeRoot={classList:classList(),setAttribute(){},onclick:null,onsubmit:null,onchange:null,onkeydown:null};
const becomeScreen={innerHTML:'',scrollTop:0};
const memory=new Map();
let fetchCount=0;
const runtime={
  Math,Map,Set,Number,String,Array,Object,JSON,Date,Promise,performance,
  localStorage:{getItem(k){return memory.has(k)?memory.get(k):null;},setItem(k,v){memory.set(k,String(v));}},
  navigator:{vibrate(){}},window:{addEventListener(){}},
  document:{getElementById(id){if(id==='becomeLab')return becomeRoot;if(id==='becomeScreen')return becomeScreen;return null;}},
  shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,
  GAME_BY_KEY:{'maker:2':{}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
  fetch:async()=>{fetchCount++;throw new Error('network forbidden during diversity test');}
};
vm.createContext(runtime);
vm.runInContext(`${becomeCoreSource}\n${becomeLiveSource}\n${diversitySource}\nthis.state=becomeState;this.diversity=window.DREAM_UNITY_BECOME_DIVERSITY;this.definition=GAME_BY_KEY['maker:2'];`,runtime);
assert.equal(runtime.definition.id,'become-reality-lab');
assert.ok(runtime.diversity.worldFamilies>=24,'Become needs at least 24 orthogonal world families');

const q1=runtime.diversity.buildQueue(10);
assert.equal(q1.length,10);
assert.equal(fetchCount,0,'max-distance generation must never wait on cloud');
assert.ok(runtime.diversity.getLastBuildMs()<500,`10-scenario queue took ${runtime.diversity.getLastBuildMs()}ms`);
const families1=q1.map(s=>s.__signature.family);
assert.equal(new Set(families1).size,10,'all 10 scenarios in a session must use different world families');
for(const s of q1){
  assert.equal(s.__source,'max-distance-synthesis');
  for(const k of ['title','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions','__signature'])assert.ok(s[k],`missing ${k}`);
}
let minStructural=1,maxLexical=0;
const words=t=>new Set((String(t).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>3));
const jac=(a,b)=>{let n=0;for(const w of a)if(b.has(w))n++;return n/(a.size+b.size-n||1);};
for(let i=0;i<q1.length;i++)for(let j=i+1;j<q1.length;j++){
  const d=runtime.diversity.distance(q1[i],{signature:q1[j].__signature,title:q1[j].title,premise:q1[j].premise});
  minStructural=Math.min(minStructural,d);
  maxLexical=Math.max(maxLexical,jac(words(q1[i].premise),words(q1[j].premise)));
}
assert.ok(minStructural>=0.70,`minimum pairwise novelty distance too low: ${minStructural}`);
assert.ok(maxLexical<=0.48,`premise lexical overlap too high: ${maxLexical}`);

// Cross-session memory must strongly rotate families rather than repeating yesterday's worlds.
const q2=runtime.diversity.buildQueue(10);
assert.equal(fetchCount,0);
const families2=new Set(q2.map(s=>s.__signature.family));
const repeated=families1.filter(f=>families2.has(f)).length;
assert.ok(repeated<=2,`too many world families repeated across adjacent sessions: ${repeated}`);
assert.ok(memory.has(runtime.diversity.memoryKey),'generated signatures must persist for cross-session anti-repetition');

assert.match(workflow,/become-diversity-09\.txt/);
assert.equal(packageJson.version,'1.6.0');
console.log(`Validated: max-distance Become generated 10 scenarios in ${runtime.diversity.getLastBuildMs().toFixed(1)}ms; min distance ${minStructural.toFixed(3)}; cross-session repeats ${repeated}.`);
