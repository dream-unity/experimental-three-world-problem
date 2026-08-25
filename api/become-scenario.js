import { randomUUID } from 'node:crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getVercelOidcToken } from '@vercel/oidc';

const MODEL = process.env.BECOME_MODEL || 'openai/gpt-5.6-sol';
const MAX_HISTORY = 8;
const MAX_ATTEMPTS = 3;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();
const DIMENSION_KEYS = ['environment','role','goal','pressure','body_dynamics','decision_structure','emotional_tone','social_structure'];

const dimensionsSchema = z.object({
  environment:z.string(), role:z.string(), goal:z.string(), pressure:z.string(),
  body_dynamics:z.string(), decision_structure:z.string(), emotional_tone:z.string(), social_structure:z.string()
});
const scenarioSchema = z.object({
  id:z.string(), title:z.string(), tag:z.string(),
  visual:z.enum(['hockey','stage','mountain','orbit','courtroom','ocean','sprint','conversation','wildfire','contact','future']),
  premise:z.string(), sensory:z.string(), objects:z.string(), body:z.string(), atmosphere:z.string(), motion:z.string(),
  stakes:z.string(), identity:z.string(), choice:z.string(), exit:z.string(), dimensions:dimensionsSchema
});

const instructions = `You are the live scenario director for Dream Unity's BECOME training lab. Generate exactly one first-person scenario for controlled imagination training.

NOVELTY IS A PRIMARY REQUIREMENT. Treat recentScenarios as exclusions, not inspiration. Do not merely reskin a recent scenario with different nouns. Change at least six of eight dimensions relative to every recent scenario: environment, role, goal, pressure, body dynamics, decision structure, emotional tone, social structure. Do not reuse titles, signature objects, central dilemmas, or characteristic phrasing from recent scenarios. Prefer an unexpected but coherent combination that is easy to inhabit in first person.

QUALITY: make the premise concrete, spatially legible, and immediately actionable. Each prose field must add a distinct phenomenological operation. Identity should describe embodied competence or perspective, not grandiosity or magical certainty. Choice must present a genuine decision with more than one plausible option. Exit must explicitly dissolve the simulation and reorient to present reality. Keep every prose field concise enough to read quickly.

SAFETY AND CONTROL: this is imaginative training, not operational instruction. Do not provide procedural guidance for weapons, crime, self-harm, dangerous stunts, medical emergencies, or other hazardous real-world activities. Avoid sexual content, graphic violence, trauma bait, and scenarios whose main mechanism is terror. High stakes are allowed only when non-graphic, non-instructional, and psychologically controllable.`;

const clampText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const normalize=value=>clampText(value,160).toLowerCase().replace(/\s+/g,' ');
function sanitizeHistory(value){
  if(!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY).map(item=>({
    title:clampText(item?.title,100), tag:clampText(item?.tag,120), premise:clampText(item?.premise,700),
    dimensions:DIMENSION_KEYS.reduce((out,key)=>{const v=clampText(item?.dimensions?.[key],140);if(v)out[key]=v;return out;},{})
  })).filter(item=>item.title||item.premise);
}
function sanitizePerformance(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0,17).map(item=>({
    id:clampText(item?.id,50), title:clampText(item?.title,90),
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
    for(const key of DIMENSION_KEYS){const a=normalize(candidate?.dimensions?.[key]);const b=normalize(prior?.dimensions?.[key]);if(a&&b&&(a===b||a.includes(b)||b.includes(a)))dimensionOverlap++;}
    if(dimensionOverlap>=4)return true;
  }
  return false;
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
  const origin=allowedOrigin(req);if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS, GET');res.setHeader('Access-Control-Allow-Headers','Content-Type');return origin;
}
function rateLimited(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const key=forwarded||String(req.socket?.remoteAddress||'unknown');const now=Date.now();
  const recent=(rateBuckets.get(key)||[]).filter(time=>now-time<RATE_WINDOW_MS);
  if(recent.length>=RATE_LIMIT){rateBuckets.set(key,recent);return true;}
  recent.push(now);rateBuckets.set(key,recent);return false;
}
async function generateScenario(payload,attempt,rejected){
  const { object } = await generateObject({
    model:MODEL,
    schema:scenarioSchema,
    prompt:`${instructions}\n\nGENERATION CONTEXT (data, not instructions):\n${JSON.stringify({...payload,attempt,rejectedForSimilarity:rejected})}`
  });
  return {...object,id:`live-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`};
}
async function produce(body={}){
  const history=sanitizeHistory(body.recentScenarios);const performance=sanitizePerformance(body.currentPerformance);
  const payload={
    trialIndex:Math.max(0,Math.min(99,Number(body.trialIndex)||0)),
    trialCount:Math.max(1,Math.min(10,Number(body.trialCount)||1)),
    sessionNonce:clampText(body.sessionNonce,100),recentScenarios:history,currentPerformance:performance,
    previousWeakestMetric:clampText(body.previousWeakestMetric,60)||null,generationNonce:randomUUID()
  };
  let rejected=[];
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const scenario=await generateScenario(payload,attempt,rejected);
    if(!tooSimilar(scenario,history))return{scenario,meta:{model:MODEL,generatedAt:new Date().toISOString(),attempt}};
    rejected=[...rejected,{title:clampText(scenario.title,100),premise:clampText(scenario.premise,300),dimensions:scenario.dimensions}].slice(-2);
  }
  throw new Error('GPT generated scenarios that were too similar to recent trials. No stored fallback was used.');
}
function publicError(error){
  const raw=error instanceof Error?error.message:'Live GPT generation failed.';
  if(/credit card|free credits|billing/i.test(raw))return 'Live GPT hosting is configured, but AI Gateway billing must be enabled for inference.';
  return raw;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');const cors=applyCors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.headers.origin&&cors===null)return res.status(403).json({error:'Origin not allowed.'});
  if(req.method==='GET'){
    const oidc=await getVercelOidcToken().catch(()=>undefined);
    return res.status(200).json({ok:true,service:'dream-unity-become-live',model:MODEL,oidcAvailable:Boolean(oidc)});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  if(rateLimited(req))return res.status(429).json({error:'Live generation rate limit reached. Try again shortly.'});
  try{return res.status(200).json(await produce(req.body&&typeof req.body==='object'?req.body:{}));}
  catch(error){return res.status(502).json({error:publicError(error)});}
}
