'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createRefreshQueue } from '@/lib/chat';
export function useCommunityRecords<T>(table:'events'|'announcements',fields:string,pinned=false){
 const [rows,setRows]=useState<T[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const controls=useRef(()=>{});
 useEffect(()=>{if(!supabase){setLoading(false);setError('Sem ligação à comunidade.');return;}const client=supabase,controller=new AbortController();let active=true;
  const queue=createRefreshQueue(async()=>{const items:T[]=[];let count=Infinity;
   while(items.length<count){let query=client.from(table).select(fields,{count:'exact'});if(pinned)query=query.order('pinned',{ascending:false});query=query.order(table==='events'?'event_date':'created_at',{ascending:false}).order('id');const result=await query.range(items.length,items.length+99).abortSignal(controller.signal);if(result.error)throw result.error;if(result.count===null)throw Error('Não foi possível confirmar os dados.');count=result.count;if(!result.data?.length&&items.length<count)throw Error('A lista ficou incompleta. Tenta novamente.');items.push(...(result.data||[]) as T[]);}
   if(active){setRows(items);setLoading(false);setError('');}
  },error=>{if(active){setLoading(false);setError((error as {message?:string}).message||'Não foi possível carregar os dados.');}});
  const refresh=()=>void queue.request();controls.current=refresh;refresh();
  const subscription=client.channel(`run258-board-${table}-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{active=false;controller.abort();queue.stop();controls.current=()=>{};window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);void client.removeChannel(subscription)};
 },[table,fields,pinned]);
 return {rows,loading,error,reload:()=>controls.current()};
}
