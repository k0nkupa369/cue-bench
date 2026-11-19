import {z} from 'zod';
import {decisionFormat,decisionInstruction,protocol,type Mode} from './study.ts';
import type {Attempt} from './grade.ts';

export const providers=['openai','anthropic','gemini'] as const;
export type Provider=typeof providers[number];
export const credential={openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY'} satisfies Record<Provider,string>;

const count=z.number().int().nonnegative();
const openaiUsage=z.object({
  total_tokens:count,input_tokens:count,output_tokens:count,
  input_tokens_details:z.object({cached_tokens:count}).optional(),
  output_tokens_details:z.object({reasoning_tokens:count}).optional()
});
const anthropicUsage=z.object({
  input_tokens:count,output_tokens:count,
  cache_creation_input_tokens:count.nullish(),cache_read_input_tokens:count.nullish()
});
const geminiUsage=z.object({
  totalTokenCount:count,
  promptTokenCount:count.optional(),cachedContentTokenCount:count.optional(),
  candidatesTokenCount:count.optional(),thoughtsTokenCount:count.optional(),toolUsePromptTokenCount:count.optional()
});
const claudeResponse=z.object({
  id:z.string().optional(),model:z.string().optional(),stop_reason:z.string().nullish(),usage:z.unknown(),
  content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional()
});
const geminiResponse=z.object({
  responseId:z.string().optional(),modelVersion:z.string().optional(),usageMetadata:z.unknown(),
  candidates:z.array(z.object({finishReason:z.string().optional(),content:z.object({
    parts:z.array(z.object({text:z.string().optional(),thought:z.boolean().optional()}))
  }).optional()})).optional()
});
const openaiResponse=z.object({
  id:z.string().optional(),model:z.string().optional(),status:z.string().optional(),usage:z.unknown(),
  output:z.array(z.object({content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional()})).optional()
});

type Usage={totalTokens:number,reported:z.infer<typeof openaiUsage>|z.infer<typeof anthropicUsage>|z.infer<typeof geminiUsage>};
export type Readback={
  httpStatus:number,requestId:string|null,responseId:string|null,model:string|null,
  stopReason:string|null,usage:Usage|null
};
export type StandaloneAttempt=Omit<Attempt,'origin'|'phase'|'mode'|'tokens'|'costUsd'|'termination'> & {
  origin:Provider,phase:'standalone',mode:Mode,tokens:number|null,costUsd:null,maxCalls:number,
  protocolVersion:number,termination:Attempt['termination']|'checkpoint',readbacks:(Readback|null)[],error?:string
};

export async function queryProvider(args:{
  provider:Provider,model:string,key:string,workspaceId?:string,mode:Mode,text:string,image?:string,signal:AbortSignal
}):Promise<{text:string,readback:Readback}>{
  const {provider,model,key,workspaceId,mode,text,image,signal}=args;
  const format=decisionFormat(mode);
  const headers=new Headers({'Content-Type':'application/json'});
  let url:string;
  let body:object;
  if(provider==='openai'){
    url='https://api.openai.com/v1/responses';
    headers.set('Authorization','Bearer '+key);
    body={model,store:false,service_tier:'default',max_output_tokens:protocol.outputTokens,instructions:decisionInstruction,
      text:{format:{type:'json_schema',name:'browser_decision',strict:true,schema:format}},
      input:[{role:'user',content:[{type:'input_text',text},...(image?[{
        type:'input_image',image_url:'data:image/jpeg;base64,'+image,detail:'high'
      }]:[])]}]};
  }else if(provider==='anthropic'){
    url='https://api.anthropic.com/v1/messages';
    headers.set('Authorization','Bearer '+key);
    if(workspaceId)headers.set('anthropic-workspace-id',workspaceId);
    headers.set('anthropic-version','2026-10-21');
    body={model,system:decisionInstruction,max_tokens:protocol.outputTokens,
      output_config:{format:{type:'json_schema',schema:format}},
      messages:[{role:'user',content:[{type:'text',text},...(image?[{type:'image',source:{
        type:'base64',media_type:'image/jpeg',data:image
      }}]:[])]}]};
  }else{
    url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
    headers.set('x-goog-api-key',key);
    body={systemInstruction:{parts:[{text:decisionInstruction}]},
      contents:[{role:'user',parts:[{text},...(image?[{inlineData:{mimeType:'image/jpeg',data:image}}]:[])]}],
      generationConfig:{maxOutputTokens:protocol.outputTokens,responseMimeType:'application/json',responseJsonSchema:format}};
  }

  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
  const readback:Readback={
    httpStatus:response.status,requestId:response.headers.get('request-id')??response.headers.get('x-request-id'),
    responseId:null,model:null,stopReason:null,usage:null
  };
  if(!response.ok){
    await response.body?.cancel().catch(()=>{});
    return {text:'',readback};
  }
  const payload:unknown=await response.json().catch(()=>undefined);
  if(provider==='openai'){
    const data=openaiResponse.safeParse(payload).data;
    const usage=openaiUsage.safeParse(data?.usage).data;
    const output=data?.output?.flatMap(item=>item.content??[]).filter(part=>part.type==='output_text').map(part=>part.text??'').join('')??'';
    return {text:output,readback:{...readback,responseId:data?.id??null,model:data?.model??null,
      stopReason:data?.status??null,usage:usage?{reported:usage,totalTokens:usage.total_tokens}:null}};
  }
  if(provider==='anthropic'){
    const data=claudeResponse.safeParse(payload).data;
    const usage=anthropicUsage.safeParse(data?.usage).data;
    const output=data?.content?.filter(part=>part.type==='text').map(part=>part.text??'').join('')??'';
    return {text:output,readback:{...readback,responseId:data?.id??null,model:data?.model??null,
      stopReason:data?.stop_reason??null,usage:usage?{reported:usage,
        totalTokens:usage.input_tokens+usage.output_tokens+(usage.cache_creation_input_tokens??0)+(usage.cache_read_input_tokens??0)}:null}};
  }
  const data=geminiResponse.safeParse(payload).data;
  const usage=geminiUsage.safeParse(data?.usageMetadata).data;
  const candidate=data?.candidates?.[0];
  const output=candidate?.content?.parts.filter(part=>!part.thought).map(part=>part.text??'').join('')??'';
  return {text:output,readback:{...readback,responseId:data?.responseId??null,model:data?.modelVersion??null,
    stopReason:candidate?.finishReason??null,usage:usage?{reported:usage,totalTokens:usage.totalTokenCount}:null}};
}
