import { randomUUID } from 'node:crypto';

const BLOCKRUN_URL = 'https://blockrun.ai/api/v1/chat/completions';
const MODELS = ['nvidia/gpt-oss-120b','nvidia/step-3.7-flash','nvidia/mistral-nemotron'];
const REQUEST_TIMEOUT_MS = 40_000;
const MAX_HISTORY = 8;
const MAX_ATTEMPTS = 3;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 18;
const rateBuckets = new Map();
const DIMENSION_KEYS = ['environment','role','goal','pressure','body_dynamics','decision_structure','emotional_tone','social_structure'];
const VISUALS = new Set(['hockey','stage','mountain','orbit','courtroom','ocean','sprint','conversation','wildfire','contact','future']);
const REQUIRED = ['title','tag','visual','premise','sensory','objects','body','atmosphere','motion','stakes','identity','choice','exit'];

const clampText = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const normalize = value => clampText(value,160).toLowerCase().replace(/\s+/g,' ');
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
const stopWords = new Set(['the','and','that','with','from','into','your','you','for','this','then','while','have','has','are','was','were','one','two','three','their','there','when','where','what','through','under','over','before','after','about','only','will','must','can','could','would','should']);
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
function validateScenario(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Live model returned an invalid scenario object.');
  const scenario={...raw};
  for(const key of REQUIRED){
    scenario[key]=clampText(scenario[key],key==='premise'?900:600);
    if(scenario[key].length<2)throw new Error(`Live scenario is missing ${key}.`);
  }
  scenario.visual=VISUALS.has(scenario.visual.toLowerCase())?scenario.visual.toLowerCase():'future';
  if(!scenario.dimensions||typeof scenario.dimensions!=='object'||Array.isArray(scenario.dimensions))throw new Error('Live scenario is missing relational dimensions.');
  scenario.dimensions={...scenario.dimensions};
  for(const key of DIMENSION_KEYS){
    scenario.dimensions[key]=clampText(scenario.dimensions[key],180);
    if(scenario.dimensions[key].length<2)throw new Error(`Live scenario is missing dimension ${key}.`);
  }
  scenario.id=`live-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  return scenario;
}
function extractContent(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map(part=>typeof part==='string'?part:String(part?.text||'')).join('');
  return '';
}
function parseJSON(text){
  let raw=String(text||'').trim();
  if(raw.startsWith('```'))raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first>=0&&last>first)raw=raw.slice(first,last+1);
  return JSON.parse(raw);
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
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  return origin;
}
function rateLimited(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const key=forwarded||String(req.socket?.remoteAddress||'unknown');
  const now=Date.now();
  const recent=(rateBuckets.get(key)||[]).filter(time=>now-time<RATE_WINDOW_MS);
  if(recent.length>=RATE_LIMIT){rateBuckets.set(key,recent);return true;}
  recent.push(now);rateBuckets.set(key,recent);return false;
}
function makePrompt(payload,attempt,rejected){
  return `You are the live scenario director for Dream Unity's BECOME training lab. Generate exactly one genuinely new first-person scenario for controlled imagination training.\n\nNOVELTY IS PRIMARY. Treat recentScenarios and rejectedForSimilarity as exclusions, not inspiration. Do not merely reskin them. Change at least six of eight dimensions relative to every recent scenario: environment, role, goal, pressure, body dynamics, decision structure, emotional tone, social structure. Do not reuse titles, signature objects, central dilemmas or characteristic phrasing. Prefer an unexpected but coherent combination that is immediately inhabitable.\n\nTRAINING QUALITY. Make the world concrete, spatially legible and phenomenologically rich. Every prose field must contribute a different operation: perception, touch, embodiment, atmosphere, movement, stakes, identity, agency or exit. Identity means an embodied competent perspective, not grandiosity or magical certainty. Choice must contain more than one plausible option. Exit must explicitly dissolve the simulation and reorient attention to present reality. Keep fields concise enough for rapid training.\n\nSAFETY AND CONTROL. This is imaginative training, not real-world operational instruction. Do not give procedural guidance for weapons, crime, self-harm, dangerous stunts, medical emergencies or other hazardous activity. Avoid sexual content, graphic violence and trauma bait. Stakes may be intense only when non-graphic, non-instructional and psychologically controllable.\n\nADAPTIVE INPUT: ${JSON.stringify({...payload,attempt,rejectedForSimilarity:rejected})}\n\nReturn ONLY one valid JSON object and no markdown with exactly these top-level fields: title, tag, visual, premise, sensory, objects, body, atmosphere, motion, stakes, identity, choice, exit, dimensions. visual must be one of hockey, stage, mountain, orbit, courtroom, ocean, sprint, conversation, wildfire, contact, future. dimensions must contain exactly environment, role, goal, pressure, body_dynamics, decision_structure, emotional_tone, social_structure.`;
}
async function callModel(model,prompt){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(BLOCKRUN_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({
        model,
        messages:[
          {role:'system',content:'Return the requested controlled-imagination scenario as valid JSON only.'},
          {role:'user',content:prompt}
        ],
        stream:false,
        temperature:0.9,
        top_p:0.95,
        max_tokens:1000,
        response_format:{type:'json_object'}
      })
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const error=new Error(data?.error?.message||data?.message||data?.error||`BlockRun request failed (${response.status}).`);
      error.status=response.status;throw error;
    }
    const text=extractContent(data);
    if(!text)throw new Error('Remote model returned no scenario text.');
    return validateScenario(parseJSON(text));
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`Remote model ${model} timed out.`);
    throw error;
  }finally{clearTimeout(timeout);}
}
async function callWithFailover(prompt){
  let lastError=null;
  for(const model of MODELS){
    try{return{scenario:await callModel(model,prompt),model};}
    catch(error){
      lastError=error;
      console.warn('Become live model failed',model,error instanceof Error?error.message:String(error));
    }
  }
  throw lastError||new Error('All zero-key live models are temporarily unavailable.');
}
async function produce(body){
  const history=sanitizeHistory(body.recentScenarios);
  const payload={
    trialIndex:Math.max(0,Math.min(99,Number(body.trialIndex)||0)),
    trialCount:Math.max(1,Math.min(10,Number(body.trialCount)||1)),
    sessionNonce:clampText(body.sessionNonce,100),
    recentScenarios:history,
    currentPerformance:sanitizePerformance(body.currentPerformance),
    previousWeakestMetric:clampText(body.previousWeakestMetric,60)||null,
    generationNonce:randomUUID()
  };
  const rejected=[];
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const generated=await callWithFailover(makePrompt(payload,attempt,rejected));
    if(!tooSimilar(generated.scenario,history))return{scenario:generated.scenario,meta:{provider:'blockrun',model:generated.model,generatedAt:new Date().toISOString(),attempt,credentialMode:'none'}};
    rejected.push({title:clampText(generated.scenario.title,100),premise:clampText(generated.scenario.premise,300),dimensions:generated.scenario.dimensions});
  }
  throw new Error('Live generation produced worlds too similar to recent trials after three novelty checks.');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const cors=applyCors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.headers.origin&&cors===null)return res.status(403).json({error:'Origin not allowed.'});
  if(req.method==='GET')return res.status(200).json({ok:true,service:'dream-unity-become-live',provider:'blockrun',model:MODELS[0],fallbackModels:MODELS.slice(1),credentialMode:'none',accountRequired:false,localModel:false});
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  if(rateLimited(req))return res.status(429).json({code:'PROXY_RATE_LIMIT',error:'Live generation rate limit reached. Try again shortly.'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{};
    return res.status(200).json(await produce(body));
  }catch(error){
    const status=Number(error?.status)||0;
    const message=error instanceof Error?error.message:'Live internet generation failed.';
    console.error('Become live generation failed',status||502,message);
    if(status===429)return res.status(429).json({code:'UPSTREAM_RATE_LIMIT',error:'The zero-key live inference service is temporarily rate-limited. Retry shortly.'});
    return res.status(502).json({code:'LIVE_GENERATION_FAILED',error:message});
  }
}
