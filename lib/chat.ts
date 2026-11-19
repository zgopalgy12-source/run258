import type { SupabaseClient } from '@supabase/supabase-js';
export const CHAT_CHANNELS=['geral','vitórias','momentos','eventos'] as const;
export const REACTIONS=['🔥','👏','💪'] as const;
export type Author={id:string;name:string;bio:string;avatar_url:string|null};
export type ActivityCard={type:string;distance:number;duration:number;date:string};
export type Reply={id:string;body:string;photo_url:string|null;activity_card:ActivityCard|null;author:Author|null};
export type ChatMessage=Reply & {channel_id:string;author_id:string;activity_id:string|null;reply_to:string|null;pinned:boolean;created_at:string;reply:Reply|null};
export type ReactionCount={message_id:string;emoji:string;total:number;mine:boolean};
export type Channel={id:string;name:string};
export const chatFields='id,channel_id,author_id,body,photo_url,activity_id,activity_card,reply_to,pinned,created_at,author:profiles!messages_author_id_fkey(id,name,bio,avatar_url)';
export async function readChannels(client:SupabaseClient,signal:AbortSignal):Promise<Channel[]> {
  const {data,error}=await client.from('channels').select('id,name').in('name',[...CHAT_CHANNELS]).abortSignal(signal);
  if(error)throw error;
  const channels=CHAT_CHANNELS.map(name=>(data||[]).find(c=>c.name===name));
  if(channels.some(c=>!c))throw new Error('Faltam canais. Executa o SQL da fase 4 no Supabase e tenta novamente.');
  return channels as Channel[];
}
export async function readChatFeed(client:SupabaseClient,channelId:string,wanted:number,signal:AbortSignal) {
  const rows:ChatMessage[]=[];let total=Infinity;
  while(rows.length<Math.min(total,wanted)) {
    const end=Math.min(rows.length+99,wanted-1);
    const {data,error,count}=await client.from('messages').select(chatFields,{count:'exact'}).eq('channel_id',channelId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(rows.length,end).abortSignal(signal);
    if(error)throw error;if(count===null)throw new Error('Não foi possível confirmar o histórico de mensagens.');
    total=count;
    if(!data?.length && rows.length<Math.min(total,wanted))throw new Error('O histórico ficou incompleto. Tenta novamente.');
    rows.push(...(data||[]) as unknown as ChatMessage[]);
  }
  const messages=Array.from(new Map(rows.map(m=>[m.id,m])).values()).reverse();
  // Busca os pais por IDs: evita a ambiguidade de joins recursivos no PostgREST.
  const replyIds=Array.from(new Set(messages.map(m=>m.reply_to).filter((id):id is string=>Boolean(id))));
  const replies=new Map<string,Reply>();
  for(let i=0;i<replyIds.length;i+=100) {
    let offset=0,count=Infinity;
    while(offset<count) {
      const result=await client.from('messages').select('id,body,photo_url,activity_card,author:profiles!messages_author_id_fkey(id,name,bio,avatar_url)',{count:'exact'}).eq('channel_id',channelId).in('id',replyIds.slice(i,i+100)).order('id').range(offset,offset+99).abortSignal(signal);
      if(result.error)throw result.error;
      if(result.count===null)throw new Error('Não foi possível carregar as respostas.');
      count=result.count;
      if(!result.data?.length&&offset<count)throw new Error('As respostas ficaram incompletas. Tenta novamente.');
      for(const row of (result.data||[]))replies.set(row.id,row as unknown as Reply);
      offset+=result.data?.length||0;
    }
  }
  for(const message of messages)message.reply=message.reply_to?replies.get(message.reply_to)||null:null;
  const reactions:ReactionCount[]=[];
  for(let i=0;i<messages.length;i+=200) {
    const {data,error}=await client.rpc('chat_reaction_summary',{p_message_ids:messages.slice(i,i+200).map(m=>m.id)}).abortSignal(signal);
    if(error)throw error;
    reactions.push(...(data||[]).map((r:ReactionCount)=>({...r,total:Number(r.total)})));
  }
  return {messages,reactions,hasOlder:rows.length<total};
}
export function messageBody(body:string,hasPhoto:boolean,activityId:string|null) {
  const value=body.trim();if(value.length>4000)throw new Error('A mensagem pode ter até 4000 caracteres.');
  if(!value&&!hasPhoto&&!activityId)throw new Error('Escreve uma mensagem, escolhe uma foto ou partilha uma atividade.');
  return value;
}
export type SendMessage={id:string;channel_id:string;author_id:string;body:string;photo_url:string|null;activity_id:string|null;reply_to:string|null};
export async function findSentMessage(client:SupabaseClient,id:string,userId:string,channelId:string) {
  const {data,error}=await client.from('messages').select('id,photo_url').eq('id',id).eq('author_id',userId).eq('channel_id',channelId).maybeSingle();
  if(error)throw error;return data as {id:string;photo_url:string|null}|null;
}
export async function sendChatMessage(client:SupabaseClient,message:SendMessage) {
  const {data,error}=await client.from('messages').insert(message).select('id,photo_url').single();
  if(!error)return data as {id:string;photo_url:string|null};
  // Se a resposta se perdeu, confirma o UUID antes de repetir o envio.
  try {const existing=await findSentMessage(client,message.id,message.author_id,message.channel_id);if(existing)return existing;}catch{/* conserva o erro original */}
  throw error;
}
export async function changeReaction(client:SupabaseClient,messageId:string,userId:string,emoji:string,mine:boolean) {
  if(!(REACTIONS as readonly string[]).includes(emoji))throw new Error('Reação inválida.');
  const result=mine?await client.from('reactions').delete().eq('message_id',messageId).eq('user_id',userId).eq('emoji',emoji):await client.from('reactions').insert({message_id:messageId,user_id:userId,emoji});
  if(result.error&&result.error.code!=='23505')throw result.error;
}
// Junta notificacoes recebidas durante uma leitura, sem resultados fora de ordem.
export function createRefreshQueue(load:()=>Promise<void>,onError:(error:unknown)=>void) {
  let stopped=false,running=false,dirty=false;
  return {async request(){if(stopped)return;if(running){dirty=true;return;}running=true;
    try {do{dirty=false;try{await load();}catch(error){if(!stopped)onError(error);}}while(dirty&&!stopped);}finally{running=false;}
  },stop(){stopped=true;dirty=false;}};
}

export async function readPinnedMessages(client:SupabaseClient,channelId:string,signal:AbortSignal):Promise<ChatMessage[]>{
  const rows:ChatMessage[]=[];let count=Infinity;
  while(rows.length<count){const result=await client.from('messages').select(chatFields,{count:'exact'}).eq('channel_id',channelId).eq('pinned',true).order('created_at',{ascending:false}).order('id').range(rows.length,rows.length+99).abortSignal(signal);if(result.error)throw result.error;if(result.count===null)throw Error('Não foi possível confirmar as mensagens fixadas.');count=result.count;if(!result.data?.length&&rows.length<count)throw Error('A lista de mensagens fixadas ficou incompleta.');rows.push(...(result.data||[]) as unknown as ChatMessage[]);}
  return rows;
}
