'use client';
import { useEffect,useRef,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { deleteModeratedMessage,setMessagePinned } from '@/lib/admin';
export function MessageModeration({id,pinned,onChanged}:{id:string;pinned:boolean;onChanged:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const lock=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function run(remove=false){if(lock.current||!supabase)return;if(remove&&!window.confirm('Apagar esta mensagem e as respetivas reações? Esta ação não pode ser desfeita.'))return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{if(remove){const cleaned=await deleteModeratedMessage(supabase,id);if(alive.current&&!cleaned)setNotice('Mensagem apagada. Não foi possível limpar a foto.');}else await setMessagePinned(supabase,id,!pinned);onChanged();}
  catch(error){if(alive.current)setError((error as {message?:string}).message||'Não foi possível moderar a mensagem.');}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <div className="message-moderation"><button type="button" className="text-link" disabled={busy} onClick={()=>void run()}>{pinned?'Desafixar':'Fixar'}</button><button type="button" className="text-link danger" disabled={busy} onClick={()=>void run(true)}>Apagar mensagem</button>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</div>;
}
