import { DurableObject } from 'cloudflare:workers';
const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export class DailyBudget extends DurableObject {
 async fetch(){
  const now=Date.now(), day=new Date(now).toISOString().slice(0,10);
  const result=await this.ctx.storage.transaction(async tx=>{
   let state=await tx.get('budget')||{day,count:0,last:0};
   if(state.day!==day)state={day,count:0,last:0};
   if(state.count>=20)return {ok:false,reason:'Daily free demo quota reached. Try tomorrow UTC.'};
   if(now-state.last<3000)return {ok:false,reason:'Please wait a few seconds.'};
   state.count++;state.last=now;await tx.put('budget',state);return {ok:true,remaining:20-state.count};
  });
  return reply(result,result.ok?200:429);
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return reply({ok:true,provider:'Cloudflare Workers AI',model:MODEL,dailyRequestLimit:20,paidFallback:false,visionModel:'@cf/meta/llama-4-scout-17b-16e-instruct'});
  if(request.method!=='POST'||url.pathname!=='/v1/chat/completions')return reply({error:'Not found'},404);
  try{
   // No CORS browser access, unrestricted model selection, tools, or proxy destinations.
   if(request.headers.get('Origin'))return reply({error:'Call from local backend only'},403);
   if(Number(request.headers.get('Content-Length')||0)>3000000)return reply({error:'Input too large'},413);
   const raw=await request.text();if(raw.length>3000000)return reply({error:'Input too large'},413);
   const input=JSON.parse(raw);
   if(!Array.isArray(input.messages)||input.messages.length>4||input.messages.some(m=>!['system','user'].includes(m.role)))return reply({error:'Invalid messages'},400);
   let images=0;const texts=[];
   for(const m of input.messages){
    if(typeof m.content==='string'){texts.push(m.content);continue;}
    if(m.role!=='user'||!Array.isArray(m.content))return reply({error:'Invalid source content'},400);
    for(const part of m.content){
     if(part.type==='text'&&typeof part.text==='string')texts.push(part.text);
     else if(part.type==='image_url'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(part.image_url?.url||'')&&part.image_url.url.length<1200000)images++;
     else return reply({error:'Only embedded source images allowed'},400);
    }
   }
   if(images>2)return reply({error:'Analyze at most two source images'},413);
   const text=texts.join('\n');if(text.length>18000)return reply({error:'Keep the selected sources under 18,000 characters'},413);
   if(!text.includes('sourceId')&&!text.includes('requirementId'))return reply({error:'Only grounded QA requirement/test drafting is supported'},400);
   const allowance=await env.BUDGET.get(env.BUDGET.idFromName('global')).fetch('https://budget/check');
   if(!allowance.ok)return allowance;
   const selectedModel=images?'@cf/meta/llama-4-scout-17b-16e-instruct':MODEL;
   const result=await env.AI.run(selectedModel,{messages:images?input.messages:input.messages.map(m=>({...m,content:typeof m.content==='string'?m.content:m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')})),response_format:{type:'json_object'},temperature:0,max_tokens:1800,max_completion_tokens:1800,reasoning_effort:'low',stream:false,tool_choice:'none'});
   const content=result?.choices?.[0]?.message?.content??result?.response;
   if(!content)return reply({error:'Model returned no draft'},502);
   let normalized=typeof content==='string'?JSON.parse(content):content;
   if(Array.isArray(normalized?.requirements))for(const row of normalized.requirements){if(typeof row.reference!=='string'||!row.reference.trim()){row.reference='Unspecified source location — review required';row.status='Unknown';}}

   return reply({choices:[{message:{role:'assistant',content:JSON.stringify(normalized)}}],model:selectedModel});
  }catch{return reply({error:'AI is temporarily unavailable; deterministic local checks still work. No paid fallback.'},503)}
 }
};
