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
const rolePath='arcade-parts/perceive-role-logic.txt';
const perceivePaths=[1,2,3,4,5,6,7,8].map(n=>`arcade-parts/perceive-aerial-${String(n).padStart(2,'0')}.txt`);
const layers=['arcade-parts/become-lab-01.txt','arcade-parts/become-diversity-09.txt','arcade-parts/become-social-agency-10.txt','arcade-parts/become-social-integration-11.txt','arcade-parts/become-compressed-12.txt','arcade-parts/become-rapid-entry-13.txt','arcade-parts/become-activation-objectives-14.txt'];
for(const path of ['index.html','styles.css','become.css','main.js','arcade.js','package.json',rolePath,...basePaths,...perceivePaths,...layers,'tests/role-drift.test.mjs','.github/workflows/validate-and-verify.yml'])assert.ok(exists(path),`${path} missing`);

const base=basePaths.map(read).join(''),role=read(rolePath),perceive=perceivePaths.map(read).join('');
const [core,diversity,social,integration,compression,rapid,objective]=layers.map(read);
const loader=read('arcade.js'),index=read('index.html'),pkg=JSON.parse(read('package.json'));
const close=base.lastIndexOf('})();');
assert.ok(close>0);
const full=`${base.slice(0,close)}\n${role}\n${perceive}\n${core}\n${diversity}\n${social}\n${integration}\n${compression}\n${rapid}\n${objective}\n${base.slice(close)}`;
const tmp=mkdtempSync(join(tmpdir(),'du-imagine-'));const fullPath=join(tmp,'complete.js');writeFileSync(fullPath,full);
for(const path of [fullPath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root))])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});

assert.match(loader,/BECOME_VERSION = '20260826-become-imagine-opening-17'/);
for(const marker of ['become-diversity-09.txt','become-social-agency-10.txt','become-social-integration-11.txt','become-compressed-12.txt','become-rapid-entry-13.txt','become-activation-objectives-14.txt'])assert.match(loader,new RegExp(marker.replace('.','\\.')));
assert.ok(loader.indexOf('become-rapid-entry-13.txt')<loader.indexOf('become-activation-objectives-14.txt'));
assert.match(index,/arcade\.js\?v=20260827-parallax-relational-induction-18/);
assert.doesNotMatch(loader,/become-live-02\.txt|vercel|blockrun|groq|web-llm|transformers/i);
for(const marker of ['S14_SCENE_OPENING','s14ImagineScene','s14ApplySceneOpening','__sceneOpening14','S14_WINS','S14_OBJECTIVES','SOLVED WHEN','SOCIAL WIN'])assert.ok(objective.includes(marker),`missing objective/opening marker ${marker}`);

let seed=0x51f15e;
const seededMath=Object.create(Math);seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
const storage=new Map();const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const classList=()=>({add(){},remove(){},contains(){return false;}});const rootEl={classList:classList(),setAttribute(){}};const screen={innerHTML:'',scrollTop:0};
const runtime={Math:seededMath,Map,Set,Number,String,Array,Object,JSON,Date,Promise,RegExp,localStorage,sessionStorage:localStorage,navigator:{vibrate(){}},window:{addEventListener(){}},document:{getElementById(id){if(id==='becomeLab')return rootEl;if(id==='becomeScreen')return screen;return null;}},shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,GAME_BY_KEY:{'maker:2':{}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,performance:{now:()=>Number(process.hrtime.bigint())/1e6},fetch:async()=>{throw new Error('network disabled')}};
vm.createContext(runtime);
vm.runInContext(`${core}\n${diversity}\n${social}\n${integration}\n${compression}\n${rapid}\n${objective}\nthis.definition=GAME_BY_KEY['maker:2'];this.drills=BECOME_DRILLS;`,runtime);
runtime.definition.factory().reset({setScore(){},setMetric(){},sfx(){}});
const api=runtime.window.DREAM_UNITY_BECOME_SOCIAL_AGENCY;
assert.equal(api.profiles,40);assert.equal(api.activationObjectiveVersion,'20260826-activation-objectives-2');assert.equal(api.sceneOpeningRule,"^Imagine that (you|you're)");assert.equal(api.socialWinCount,40);

const OPENING=/^Imagine that (?:you\b|you're\b)/;
function words(s){return String(s||'').trim().split(/\s+/).filter(Boolean).length;}
function inspect(queue,label){
  assert.equal(queue.length,10);const families=new Set(),profiles=new Set(),wins=new Set(),modes=new Set();let minSocial=1,minCombined=1,maxScene=0;
  for(const s of queue){
    assert.ok(s.__rapid13&&s.__activation14&&s.__socialAgency&&s.__socialSignature&&s.__signature);
    assert.equal(s.__activation14.version,'20260826-activation-objectives-2');
    assert.equal(s.__sceneOpening14,'imagine-that-you');
    assert.match(s.premise,OPENING,`${label} premise violates opening rule: ${s.premise}`);
    assert.match(s.__rapid13.scene,OPENING,`${label} rapid scene violates opening rule: ${s.__rapid13.scene}`);
    assert.equal(s.premise,s.__rapid13.scene);
    assert.ok(words(s.__rapid13.scene)<=34,`${label} scene >34 words: ${s.__rapid13.scene}`);
    assert.ok(s.__rapid13.totalWords<=64,`${label} entry packet >64 words: ${s.__rapid13.totalWords}`);
    maxScene=Math.max(maxScene,words(s.__rapid13.scene));
    assert.ok(words(s.__activation14.win)>=5&&words(s.__activation14.win)<=11,`${label} bad social win: ${s.__activation14.win}`);
    families.add(s.__signature.family);profiles.add(s.__socialAgency.profileId);wins.add(s.__activation14.win);
    for(const metric of runtime.drills){
      const o=api.objectiveFor(metric.id,s);modes.add(o.mode);
      assert.ok(words(o.objective)>=5&&words(o.objective)<=14,`${metric.id} objective: ${o.objective}`);
      assert.ok(words(o.solved)>=4&&words(o.solved)<=11,`${metric.id} solved: ${o.solved}`);
    }
  }
  assert.equal(families.size,10);assert.equal(profiles.size,10);assert.equal(wins.size,10);assert.equal(modes.size,17);
  for(let i=0;i<queue.length;i++)for(let j=i+1;j<queue.length;j++){
    minSocial=Math.min(minSocial,api.socialDistance(queue[i].__socialSignature,queue[j].__socialSignature));
    minCombined=Math.min(minCombined,api.combinedDistance({baseSignature:queue[i].__signature,socialSignature:queue[i].__socialSignature},{baseSignature:queue[j].__signature,socialSignature:queue[j].__socialSignature}));
  }
  assert.ok(minSocial>=0.70,`${label} social min ${minSocial}`);assert.ok(minCombined>=0.76,`${label} combined min ${minCombined}`);
  return{families,profiles,wins,minSocial,minCombined,maxScene};
}

const started=performance.now();const first=api.buildQueue(10);const elapsed=performance.now()-started;const a=inspect(first,'first');assert.ok(elapsed<1000,`build ${elapsed}ms`);
const second=api.buildQueue(10),b=inspect(second,'second');
assert.equal([...a.families].filter(x=>b.families.has(x)).length,0);assert.equal([...a.profiles].filter(x=>b.profiles.has(x)).length,0);assert.equal([...a.wins].filter(x=>b.wins.has(x)).length,0);
assert.equal(pkg.dependencies,undefined);
console.log(`Imagine-opening Become validated: 20/20 generated scenarios begin with Imagine that you/you're; scene ≤${a.maxScene}/34; 10 scenarios ${elapsed.toFixed(1)}ms; social min ${a.minSocial.toFixed(3)}; combined min ${a.minCombined.toFixed(3)}.`);
