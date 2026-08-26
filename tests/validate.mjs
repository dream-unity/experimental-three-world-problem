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
const corePath='arcade-parts/become-lab-01.txt';
const diversityPath='arcade-parts/become-diversity-09.txt';
const socialPath='arcade-parts/become-social-agency-10.txt';
const integrationPath='arcade-parts/become-social-integration-11.txt';
const compressionPath='arcade-parts/become-compressed-12.txt';
const apiPath='api/become-scenario.js';
for(const path of ['index.html','styles.css','become.css','main.js','arcade.js','README.md','package.json','.nojekyll',rolePath,...basePaths,...perceivePaths,corePath,diversityPath,socialPath,integrationPath,compressionPath,apiPath,'tests/role-drift.test.mjs','.github/workflows/validate-and-verify.yml'])assert.ok(exists(path),`${path} must exist`);

const base=basePaths.map(read).join('');
const role=read(rolePath),perceive=perceivePaths.map(read).join('');
const core=read(corePath),diversity=read(diversityPath),social=read(socialPath),integration=read(integrationPath),compression=read(compressionPath);
const loader=read('arcade.js'),index=read('index.html'),workflow=read('.github/workflows/validate-and-verify.yml');
const packageJson=JSON.parse(read('package.json'));
const close=base.lastIndexOf('})();');
assert.ok(close>0);
const complete=`${base.slice(0,close)}\n${role}\n${perceive}\n${core}\n${diversity}\n${social}\n${integration}\n${compression}\n${base.slice(close)}`;
const temp=mkdtempSync(join(tmpdir(),'dream-unity-'));
const completePath=join(temp,'complete.js');writeFileSync(completePath,complete);
for(const path of [completePath,fileURLToPath(new URL('arcade.js',root)),fileURLToPath(new URL('main.js',root)),fileURLToPath(new URL(apiPath,root))])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});

assert.match(loader,/BECOME_VERSION = '20260826-become-compressed-13'/);
for(const marker of ['become-diversity-09.txt','become-social-agency-10.txt','become-social-integration-11.txt','become-compressed-12.txt'])assert.match(loader,new RegExp(marker.replace('.','\\.')));
assert.ok(loader.indexOf('become-social-integration-11.txt')<loader.indexOf('become-compressed-12.txt'));
assert.doesNotMatch(loader,/become-live-02\.txt/);
assert.doesNotMatch(loader,/dream-unity-become-live|vercel|blockrun|groq|web-llm|transformers/i);
assert.match(index,/arcade\.js\?v=20260826-become-compressed-13/);
assert.equal((base.match(/key:\s*'(?:machine|maker|reality):[0-2]'/g)||[]).length,9);
for(const marker of ['function roleDriftGeometry','stale-role-perseveration'])assert.ok(role.includes(marker));
for(const marker of ['function createPerceptionAerialGame',"GAME_BY_KEY['machine:0']",'roleSwitchAt'])assert.ok(perceive.includes(marker));
for(const marker of ['function createBecomeLab',"GAME_BY_KEY['maker:2']",'BECOME_DRILLS','BECOME_TRANSFER_DRILLS'])assert.ok(core.includes(marker));
for(const marker of ['D9_WORLDS','d9Candidate','d9SigDistance','d9MemoryRead'])assert.ok(diversity.includes(marker));
for(const marker of ['S10_PROFILES','S10_COMBINED_AXES','s10SelectCombos','s10SchedulePrewarm','NON-PERFORMATIVE EMPATHY','AGENTIC SELF-AWARENESS'])assert.ok(social.includes(marker),`missing ${marker}`);
for(const marker of ['S11_FIT','s11Compatibility','FEEDBACK TEST','WORLD DECISION','3 OTHER-MIND MODELS'])assert.ok(integration.includes(marker),`missing ${marker}`);
for(const marker of ['S12_BRIEF_WORD_MAX=48','S12_PROMPT_WORD_MAX=20','S12_PROFILE_COMPACT','s12BuildBrief','s12Prompt','≤ ${S12_BRIEF_WORD_MAX} WORD SCENE'])assert.ok(compression.includes(marker),`missing compression marker ${marker}`);
assert.doesNotMatch(social+integration+compression,/bShuffle\(BECOME_SCENARIOS\)/);

let seed=0x9e3779b9;
const seededMath=Object.create(Math);seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const classList=()=>({add(){},remove(){},contains(){return false;}});
const becomeRoot={classList:classList(),setAttribute(){},onclick:null,onsubmit:null,onchange:null,onkeydown:null};
const becomeScreen={innerHTML:'',scrollTop:0};
const runtime={
  Math:seededMath,Map,Set,Number,String,Array,Object,JSON,Date,Promise,RegExp,
  localStorage,sessionStorage:localStorage,navigator:{vibrate(){}},window:{addEventListener(){}},
  document:{getElementById(id){if(id==='becomeLab')return becomeRoot;if(id==='becomeScreen')return becomeScreen;return null;}},
  shell:{classList:classList()},gameHint:{textContent:''},closeGame(){},rgba:(rgb,a)=>`rgba(${rgb.join(',')},${a})`,
  GAME_BY_KEY:{'maker:2':{}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
  performance:{now:()=>Number(process.hrtime.bigint())/1e6},fetch:async()=>{throw new Error('network disabled')}
};
vm.createContext(runtime);
vm.runInContext(`${core}\n${diversity}\n${social}\n${integration}\n${compression}\nthis.definition=GAME_BY_KEY['maker:2'];this.drills=BECOME_DRILLS;this.state=becomeState;this.prompt=bPrompt;`,runtime);
assert.equal(runtime.definition.id,'become-reality-lab');
runtime.definition.factory().reset({setScore(){},setMetric(){},sfx(){}});
assert.match(becomeScreen.innerHTML,/SOCIAL<br>AGENCY LAB/);
const api=runtime.window.DREAM_UNITY_BECOME_SOCIAL_AGENCY;
assert.equal(api.profiles,40);assert.equal(api.socialAxes,16);assert.equal(api.combinedAxes,29);
assert.equal(api.integrationVersion,'20260826-social-integration-1');
assert.equal(api.compressionVersion,'20260826-compressed-social-agency-1');
assert.equal(api.briefWordMax,48);assert.equal(api.promptWordMax,20);

function inspect(queue,label){
  assert.equal(queue.length,10);
  const families=new Set(),profiles=new Set(),empathy=new Set(),agency=new Set(),bands=new Set();
  let maxBrief=0;
  for(const s of queue){
    for(const key of ['id','title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions'])assert.ok(s[key],`${label} missing ${key}`);
    assert.equal(s.__source,'social-agency-max-distance');assert.equal(s.__integrationVersion,'20260826-social-integration-1');assert.equal(s.__compressionVersion,'20260826-compressed-social-agency-1');
    assert.ok(s.__socialAgency);assert.ok(s.__compact);assert.notEqual(s.dimensions.social_structure,'solo');
    const briefWords=api.countWords(s.premise);maxBrief=Math.max(maxBrief,briefWords);
    assert.ok(briefWords<=48,`${label} ${s.title} has ${briefWords} brief words`);
    assert.ok(briefWords>=20,`${label} ${s.title} is too thin at ${briefWords} words`);
    assert.ok(api.countWords(s.__compact.move)<=10,'ACT cue too long');
    assert.ok(api.countWords(s.__compact.other)<=8,'OTHER cue too long');
    families.add(s.__signature.family);profiles.add(s.__socialAgency.profileId);empathy.add(s.__socialSignature.empathyOperation);agency.add(s.__socialSignature.agencyMode);bands.add(s.__socialAgency.worldSocialBand);
  }
  assert.equal(families.size,10);assert.equal(profiles.size,10);assert.equal(empathy.size,10);assert.equal(agency.size,10);assert.ok(bands.size>=3);
  let minSocial=1,minCombined=1;
  for(let i=0;i<queue.length;i++)for(let j=i+1;j<queue.length;j++){
    minSocial=Math.min(minSocial,api.socialDistance(queue[i].__socialSignature,queue[j].__socialSignature));
    minCombined=Math.min(minCombined,api.combinedDistance({baseSignature:queue[i].__signature,socialSignature:queue[i].__socialSignature},{baseSignature:queue[j].__signature,socialSignature:queue[j].__socialSignature}));
  }
  assert.ok(minSocial>=0.70,`${label} social min ${minSocial}`);assert.ok(minCombined>=0.76,`${label} combined min ${minCombined}`);
  return{families,profiles,minSocial,minCombined,bands,maxBrief};
}

const start=performance.now();const first=api.buildQueue(10);const elapsed=performance.now()-start;
const a=inspect(first,'first');assert.ok(elapsed<1000,`build ${elapsed}ms`);
runtime.state.queue=first;runtime.state.track='scenario';runtime.state.scenarioIndex=0;
let maxPrompt=0;
for(let i=0;i<runtime.drills.length;i++){
  runtime.state.drillIndex=i;
  const text=runtime.prompt();const words=api.countWords(text);maxPrompt=Math.max(maxPrompt,words);
  assert.ok(words<=20,`${runtime.drills[i].id} prompt has ${words} words: ${text}`);
  assert.ok(words>=5,`${runtime.drills[i].id} prompt lacks substance: ${text}`);
}
const b=inspect(api.buildQueue(10),'second');
assert.equal([...a.families].filter(x=>b.families.has(x)).length,0);assert.equal([...a.profiles].filter(x=>b.profiles.has(x)).length,0);
const metrics=Object.fromEntries(runtime.drills.map(x=>[x.id,x]));
assert.equal(metrics.agency.title,'RELATIONAL AGENCY');assert.equal(metrics.authenticity.title,'NON-PERFORMATIVE EMPATHY');assert.equal(metrics.identity.title,'AGENTIC SELF-AWARENESS');assert.equal(metrics.integrated.title,'MULTI-PERSPECTIVE INTEGRATION');
assert.match(workflow,/become-compressed-12\.txt/);assert.equal(packageJson.version,'1.7.0');assert.equal(packageJson.dependencies,undefined);
console.log(`Validated: compressed social agency; max brief ${a.maxBrief}/48 words; max prompt ${maxPrompt}/20; 10 scenarios in ${elapsed.toFixed(1)}ms; social min ${a.minSocial.toFixed(3)}; combined min ${a.minCombined.toFixed(3)}; zero next-session repeats.`);
