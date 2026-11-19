'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ChatMessage, createRefreshQueue, ReactionCount, readChatFeed, readPinnedMessages } from '@/lib/chat';
type Feed={messages:ChatMessage[];pinned:ChatMessage[];reactions:ReactionCount[];hasOlder:boolean;loading:boolean;fetching:boolean;error:string;connection:string};
const initial:Feed={messages:[],pinned:[],reactions:[],hasOlder:false,loading:true,fetching:false,error:'',connection:'A ligar…'};
export function useChatFeed(userId:string,channelId:string) {
  const [feed,setFeed]=useState(initial),[retry,setRetry]=useState(0);
  const actions=useRef({refresh:()=>{},older:()=>{}});
  useEffect(()=>{
    if(!supabase)return;
    const client=supabase,controller=new AbortController();let active=true,wanted=50;
    setFeed(initial);
    const queue=createRefreshQueue(async()=>{
      if(active)setFeed(v=>({...v,fetching:true}));
      const [data,pinned]=await Promise.all([readChatFeed(client,channelId,wanted,controller.signal),readPinnedMessages(client,channelId,controller.signal)]);
      if(active)setFeed(v=>({...v,...data,pinned,loading:false,fetching:false,error:''}));
    },error=>{if(active)setFeed(v=>({...v,loading:false,fetching:false,error:(error as {message?:string}).message||'Não foi possível carregar o chat.'}));});
    const refresh=()=>void queue.request();
    actions.current={refresh,older:()=>{wanted+=50;refresh()}};
    const subscription=client.channel(`run258-chat-${channelId}-${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'messages'},payload=>{
        const row=payload.new as {channel_id?:string};
        if(payload.eventType==='DELETE'||row.channel_id===channelId){if(payload.eventType==='INSERT')wanted++;refresh();}
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'reactions'},refresh)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},refresh)
      .subscribe(status=>{
        if(!active)return;
        setFeed(v=>({...v,connection:status==='SUBSCRIBED'?'Em tempo real':status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'?'Ligação interrompida. A tentar restabelecer…':'A ligar…'}));
        if(status==='SUBSCRIBED')refresh();
      });
    // A leitura inicial nao depende de a ligacao websocket estar disponivel.
    refresh();window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
    return()=>{active=false;queue.stop();controller.abort();actions.current={refresh:()=>{},older:()=>{}};window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);void client.removeChannel(subscription);};
  },[userId,channelId,retry]);
  return {...feed,refresh:()=>actions.current.refresh(),older:()=>actions.current.older(),reconnect:()=>setRetry(v=>v+1)};
}
