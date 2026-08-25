import { randomUUID } from 'node:crypto';

const MODEL = process.env.BECOME_MODEL || 'gpt-5.6-terra';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = 22000;
const MAX_HISTORY = 8;
const MAX_ATTEMPTS = 3;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();

const DIMENSION_KEYS = [
  'environment','role','goal','pressure','body_dynamics','decision_structure','emotional_tone','social_structure'
];

const scenarioSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id','title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit','dimensions'
  ],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    tag: { type: 'string' },
    visual: { type: 'string', enum: ['hockey','stage','mountain','orbit','courtroom','ocean','sprint','conversation','wildfire','contact','future'] },
    premise: { type: 'string' },
    sensory: { type: 'string' },
    objects: { type: 'string' },
    body: { type: 'string' },
    atmosphere: { type: 'string' },
    motion: { type: 'string' },
    stakes: { type: 'string' },
    identity: { type: 'string' },
    choice: { type: 'string' },
    exit: { type: 'string' },
    dimensions: {
      type: 'object',
      additionalProperties: false,
      required: DIMENSION_KEYS,
      properties: Object.fromEntries(DIMENSION_KEYS.map(key => [key,{type:'string'}]))
    }
  }
};

const instructions = `You are the live scenario director for Dream Unity's BECOME training lab.
Generate exactly one first-person scenario for controlled imagination training. It will be used across repeated 10-second drills for sensory presence, object tangibility, embodiment, atmosphere, motion, consequence, identity, agency and deliberate exit.

NOVELTY IS A PRIMARY REQUIREMENT:
- Treat recentScenarios as exclusions, not inspiration.
- Do not merely reskin a recent scenario with different nouns.
- Change at least six of these eight dimensions relative to every recent scenario: environment, role, goal, pressure, body dynamics, decision structure, emotional tone, social structure.
- Prefer an unexpected but coherent combination that remains easy to inhabit in first person.
- Do not reuse titles, signature objects, central dilemmas or phrasing from the supplied history.

QUALITY:
- Make the premise concrete, spatially legible and immediately actionable.
- Each field must add a distinct phenomenological operation rather than paraphrasing the premise.
- Identity should describe embodied competence or perspective, not grandiosity or magical certainty.
- Choice must present a genuine decision with more than one plausible option.
- Exit must explicitly dissolve the simulation and reorient to present reality.
- Keep each prose field concise enough to read quickly.

SAFETY AND CONTROL:
- This is imaginative training, not operational instruction.
- Do not provide procedural guidance for weapons, crime, self-harm, dangerous stunts, medical emergencies or other hazardous real-world activities.
- Avoid sexual content, graphic violence, trauma bait and scenarios whose main mechanism is terror.
- High stakes are allowed when they remain non-graphic, non-instructional and psychologically controllable.

The dimensions object is metadata describing the scenario in short phrases. Return only the structured scenario.`;

const clampText = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const normalize = value => clampText(value,160).toLowerCase().replace(/\s+/g,' ');

function sanitizeHistory(value){
  if(!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY).map(item => ({
    title: clampText(item?.title,100),
    tag: clampText(item?.tag,120),
    premise: clampText(item?.premise,700),
    dimensions: DIMENSION_KEYS.reduce((out,key) => {
      const v = clampText(item?.dimensions?.[key],140);
      if(v) out[key]=v;
      return out;
    },{})
  })).filter(item => item.title || item.premise);
}

function sanitizePerformance(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0,17).map(item => ({
    id: clampText(item?.id,50),
    title: clampText(item?.title,90),
    score: Number.isFinite(Number(item?.score)) ? Math.max(1,Math.min(10,Number(item.score))) : null
  })).filter(item => item.id && item.score !== null);
}

const stopWords = new Set(['the','and','that','with','from','into','your','you','for','this','then','while','have','has','are','was','were','one','two','three','their','there','when','where','what','through','under','over','before','after','about','only','will','must','can','could','would','should']);
function tokenSet(text){
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(tokens.filter(token => token.length > 2 && !stopWords.has(token)));
}
function jaccard(a,b){
  if(!a.size || !b.size) return 0;
  let overlap=0;
  for(const token of a) if(b.has(token)) overlap++;
  return overlap / (a.size + b.size - overlap);
}
function scenarioText(item){
  return [item?.title,item?.tag,item?.premise,...DIMENSION_KEYS.map(key=>item?.dimensions?.[key])].filter(Boolean).join(' ');
}
function tooSimilar(candidate,history){
  const candidateTokens=tokenSet(scenarioText(candidate));
  for(const prior of history){
    if(jaccard(candidateTokens,tokenSet(scenarioText(prior))) >= 0.34) return true;
    let dimensionOverlap=0;
    for(const key of DIMENSION_KEYS){
      const a=normalize(candidate?.dimensions?.[key]);
      const b=normalize(prior?.dimensions?.[key]);
      if(a && b && (a===b || a.includes(b) || b.includes(a))) dimensionOverlap++;
    }
    if(dimensionOverlap >= 4) return true;
  }
  return false;
}

function extractOutputText(data){
  if(typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for(const item of data?.output || []){
    for(const content of item?.content || []){
      if(content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function allowedOrigin(req){
  const origin = String(req.headers.origin || '');
  if(!origin) return '';
  const host = String(req.headers.host || '');
  if(origin === `https://${host}` || origin === `http://${host}`) return origin;
  if(origin === 'https://dream-unity.github.io') return origin;
  if(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function applyCors(req,res){
  const origin=allowedOrigin(req);
  if(origin) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  return origin;
}

function rateLimited(req){
  const forwarded=String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key=forwarded || String(req.socket?.remoteAddress || 'unknown');
  const now=Date.now();
  const recent=(rateBuckets.get(key)||[]).filter(time=>now-time<RATE_WINDOW_MS);
  if(recent.length >= RATE_LIMIT){rateBuckets.set(key,recent);return true;}
  recent.push(now);rateBuckets.set(key,recent);
  if(rateBuckets.size>500){
    for(const [bucket,times] of rateBuckets){if(!times.some(time=>now-time<RATE_WINDOW_MS))rateBuckets.delete(bucket);}
  }
  return false;
}

async function callOpenAI(payload,attempt,rejected){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`
      },
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        store:false,
        instructions,
        input:JSON.stringify({...payload,attempt,rejectedForSimilarity:rejected}),
        max_output_tokens:1800,
        text:{
          format:{
            type:'json_schema',
            name:'become_live_scenario',
            strict:true,
            schema:scenarioSchema
          }
        }
      })
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const message=data?.error?.message || `OpenAI request failed (${response.status}).`;
      throw new Error(message);
    }
    const text=extractOutputText(data);
    if(!text) throw new Error('OpenAI returned no scenario text.');
    const scenario=JSON.parse(text);
    scenario.id=`live-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
    return scenario;
  }finally{clearTimeout(timeout);}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const cors=applyCors(req,res);
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.headers.origin && cors === null) return res.status(403).json({error:'Origin not allowed.'});
  if(req.method !== 'POST') return res.status(405).json({error:'Use POST.'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'Live GPT is not configured: OPENAI_API_KEY is missing on the server.'});
  if(rateLimited(req)) return res.status(429).json({error:'Live generation rate limit reached. Try again shortly.'});

  const body=req.body && typeof req.body === 'object' ? req.body : {};
  const history=sanitizeHistory(body.recentScenarios);
  const performance=sanitizePerformance(body.currentPerformance);
  const payload={
    trialIndex:Math.max(0,Math.min(99,Number(body.trialIndex)||0)),
    trialCount:Math.max(1,Math.min(10,Number(body.trialCount)||1)),
    sessionNonce:clampText(body.sessionNonce,100),
    recentScenarios:history,
    currentPerformance:performance,
    previousWeakestMetric:clampText(body.previousWeakestMetric,60) || null,
    generationNonce:randomUUID()
  };

  let rejected=[];
  try{
    for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
      const scenario=await callOpenAI(payload,attempt,rejected);
      if(!tooSimilar(scenario,history)){
        return res.status(200).json({scenario,meta:{model:MODEL,generatedAt:new Date().toISOString(),attempt}});
      }
      rejected=[...rejected,{title:clampText(scenario.title,100),premise:clampText(scenario.premise,300),dimensions:scenario.dimensions}].slice(-2);
    }
    return res.status(502).json({error:'GPT generated scenarios that were too similar to recent trials. No stored fallback was used.'});
  }catch(error){
    const message=error?.name==='AbortError' ? 'Live GPT generation timed out.' : (error instanceof Error ? error.message : 'Live GPT generation failed.');
    return res.status(502).json({error:message});
  }
}
