import { randomUUID } from 'node:crypto';

const MODEL = process.env.BECOME_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/responses';
const REQUEST_TIMEOUT_MS = 22000;
const MAX_HISTORY = 8;
const MAX_ATTEMPTS = 3;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();
const DIMENSION_KEYS = ['environment','role','goal','pressure','body_dynamics','decision_structure','emotional_tone','social_structure'];

const scenarioSchema = {
  type:'object',
  additionalProperties:false,
  required:['id','title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions'],
  properties:{
    id:{type:'string'},
    title:{type:'string'},
    tag:{type:'string'},
    visual:{type:'string',enum:['hockey','stage','mountain','orbit','courtroom','ocean','sprint','conversation','wildfire','contact','future']},
    premise:{type:'string'},
    sensory:{type:'string'},
    objects:{type:'string'},
    body:{type:'string'},
    atmosphere:{type:'string'},
    motion:{type:'string'},
    stakes:{type:'string'},
    identity:{type:'string'},
    choice:{type:'string'},
    exit:{type:'string'},
    dimensions:{
      type:'object',
      additionalProperties:false,
      required:DIMENSION_KEYS,
      properties:Object.fromEntries(DIMENSION_KEYS.map(key=>[key,{type:'string'}]))
    }
  }
};

const instructions = `You are the live scenario director for Dream Unity's BECOME training lab. Generate exactly one first-person scenario for controlled imagination training.

NOVELTY IS A PRIMARY REQUIREMENT. Treat recentScenarios as exclusions, not inspiration. Do not merely reskin a recent scenario with different nouns. Change at least six of eight dimensions relative to every recent scenario: environment, role, goal, pressure, body dynamics, decision structure, emotional tone, social structure. Do not reuse titles, signature objects, central dilemmas, or characteristic phrasing from recent scenarios. Prefer an unexpected but coherent combination that is easy to inhabit in first person.

QUALITY: make the premise concrete, spatially legible, and immediately actionable. Each prose field must add a distinct phenomenological operation. Identity should describe embodied competence or perspective, not grandiosity or magical certainty. Choice must present a genuine decision with more than one plausible option. Exit must explicitly dissolve the simulation and reorient to present reality. Keep every prose field concise enough to read quickly.

SAFETY AND CONTROL: this is imaginative training, not operational instruction. Do not provide procedural guidance for weapons, crime, self-harm, dangerous stunts, medical emergencies, or other hazardous real-world activities. Avoid sexual content, graphic violence, trauma bait, and scenarios whose main mechanism is terror. High stakes are allowed only when non-graphic, non-instructional, and psychologically controllable.`;

const clampText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const normalize=value=>clampText(value,160).toLowerCase().replace(/\s+/g,' ');
function sanitizeHistory(value){
  if(!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY).map(item=>({
    title:clampText(item?.title,100),
    tag:clampText(item?.tag,120),
    premise:clampText(item?.premise,700),
    dimensions:DIMENSION_KEYS.reduce((out,key)=>{const v=clampText(item?.dimensions?.[key],140);if(v)out[key]=v;return out;},{})
  })).filter(item=>item.title||item.premise);
}
function sanitizePerformance(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0,17).map(item=>({
    id:clampText(item?.id,50),
    title:clampText(item?.title,90),
    score:Number.isFinite(Number(item?.score))?Math.max(1,Math.min(10,Number(item.score))):null
  })).filter(item=>item.id&&item.score!==null);
}
const stopWords=new Set(['the','and','that','with','from','into','your','you','for','this','then','while','have','has','are','was','were','one','two','three','their','there','when','where','what','through','under','over','before','after','about','only','will','must','can','could','would','should']);
function tokenSet(text){const tokens=String(text||'').toLowerCase().match(/[a-z0-9]+/g)||[];return new Set(tokens.filter(t=>t.length>2&&!stopWords.has(t)));}
function jaccard(a,b){if(!a.size||!b.size)return 0;let overlap=0;for(const t of a)if(b.has(t))overlap++;return overlap/(a.size+b.size-overlap);}
function scenarioText(item){return[item?.title,item?.tag,item?.premise,...DIMENSION_KEYS.map(k=>item?.dimensions?.[k])].filter(Boolean).join(' ');}
function tooSimilar(candidate,history){
  const candidateTokens=tokenSet(scenarioText(candidate));
  for(const prior of history){
    if(jaccard(candidateTokens,tokenSet(scenarioText(prior)))>=0.34)return true;
    let dimensionOverlap=0;
    for(const key of DIMENSION_KEYS){
      const a=normalize(candidate?.dimensions?.[key]);
      const b=normalize(prior?.dimensions?.[key]);
      if(a&&b&&(a===b||a.includes(b)||b.includes(a)))dimensionOverlap++;
    }
    if(dimensionOverlap>=4)return true;
  }
  return false;
}
function extractOutputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text;
  for(const item of data?.output||[]){
    for(const content of item?.content||[]){
      if(content?.type==='output_text'&&typeof content.text==='string')return content.text;
    }
  }
  return '';
}
function allowedOrigin(req){
  const origin=String(req.headers.origin||'');
  if(!origin)return'';
  const host=String(req.headers.host||'');
  if(origin===`https://${host}`||origin===`http://${host}`)return origin;
  if(origin==='https://dream-unity.github.io')return origin;
  if(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return origin;
  return null;
}
function applyCors(req,res){
  const origin=allowedOrigin(req);
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Groq-Api-Key');
  return origin;
}
function rateLimited(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const key=forwarded||String(req.socket?.remoteAddress||'unknown');
  const now=Date.now();
  const recent=(rateBuckets.get(key)||[]).filter(time=>now-time<RATE_WINDOW_MS);
  if(recent.length>=RATE_LIMIT){rateBuckets.set(key,recent);return true;}
  recent.push(now);rateBuckets.set(key,recent);
  return false;
}
function readGroqKey(req){
  const serverKey=clampText(process.env.GROQ_API_KEY,256);
  if(serverKey)return serverKey;
  return clampText(req.headers['x-groq-api-key'],256);
}
async function callGroq(apiKey,payload,attempt,rejected){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(GROQ_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        instructions,
        input:JSON.stringify({...payload,attempt,rejectedForSimilarity:rejected}),
        max_output_tokens:1800,
        reasoning:{effort:'medium'},
        text:{format:{type:'json_schema',name:'become_live_scenario',strict:true,schema:scenarioSchema}}
      })
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const error=new Error(data?.error?.message||`Groq request failed (${response.status}).`);
      error.status=response.status;
      throw error;
    }
    const text=extractOutputText(data);
    if(!text)throw new Error('Groq returned no scenario text.');
    const scenario=JSON.parse(text);
    return {...scenario,id:`live-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`};
  }finally{clearTimeout(timeout);}
}
async function produce(body,apiKey){
  const history=sanitizeHistory(body.recentScenarios);
  const performance=sanitizePerformance(body.currentPerformance);
  const payload={
    trialIndex:Math.max(0,Math.min(99,Number(body.trialIndex)||0)),
    trialCount:Math.max(1,Math.min(10,Number(body.trialCount)||1)),
    sessionNonce:clampText(body.sessionNonce,100),
    recentScenarios:history,
    currentPerformance:performance,
    previousWeakestMetric:clampText(body.previousWeakestMetric,60)||null,
    generationNonce:randomUUID()
  };
  let rejected=[];
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const scenario=await callGroq(apiKey,payload,attempt,rejected);
    if(!tooSimilar(scenario,history))return{scenario,meta:{provider:'groq',model:MODEL,generatedAt:new Date().toISOString(),attempt}};
    rejected=[...rejected,{title:clampText(scenario.title,100),premise:clampText(scenario.premise,300),dimensions:scenario.dimensions}].slice(-2);
  }
  throw new Error('The generator produced scenarios that were too similar to recent trials. No stored fallback was used.');
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const cors=applyCors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.headers.origin&&cors===null)return res.status(403).json({error:'Origin not allowed.'});
  if(req.method==='GET')return res.status(200).json({
    ok:true,
    service:'dream-unity-become-live',
    provider:'groq',
    model:MODEL,
    credentialMode:process.env.GROQ_API_KEY?'server':'session-key'
  });
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  if(rateLimited(req))return res.status(429).json({code:'PROXY_RATE_LIMIT',error:'Live generation rate limit reached. Try again shortly.'});
  const apiKey=readGroqKey(req);
  if(!apiKey)return res.status(401).json({code:'GROQ_KEY_REQUIRED',error:'A Groq API key is required for free live generation.'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{};
    return res.status(200).json(await produce(body,apiKey));
  }catch(error){
    const status=Number(error?.status)||0;
    if(status===401||status===403)return res.status(401).json({code:'GROQ_KEY_INVALID',error:'Groq rejected this API key. Create or paste a valid free Groq key and retry.'});
    if(status===429)return res.status(429).json({code:'GROQ_RATE_LIMIT',error:'The Groq free-tier rate limit was reached. Retry after the limit resets.'});
    const message=error?.name==='AbortError'?'Live Groq generation timed out.':(error instanceof Error?error.message:'Live Groq generation failed.');
    return res.status(502).json({code:'GROQ_GENERATION_FAILED',error:message});
  }
}
