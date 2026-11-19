'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ProfileAvatar } from '@/app/profile';
import { changeFollow, readFollowCounts } from '@/lib/social';
export function useSocial(userId?:string) {
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{owner?:string;followers:number;following:number;loading:boolean;error:string}>({followers:0,following:0,loading:false,error:''});
  useEffect(()=>{
    const controller=new AbortController();
    if(!userId||!supabase){setState({followers:0,following:0,loading:false,error:''});return;}
    const client=supabase;
    setState({owner:userId,followers:0,following:0,loading:true,error:''});
    void (async()=>{try {
      const counts=await readFollowCounts(client,userId,controller.signal);
      if(!controller.signal.aborted)setState({owner:userId,...counts,loading:false,error:''});
    }catch(error){if(!controller.signal.aborted)setState({owner:userId,followers:0,following:0,loading:false,error:(error as {message?:string}).message||'Não foi possível carregar os seguidores.'});}})();
    return()=>controller.abort();
  },[userId,revision]);
  return {revision,refresh:()=>setRevision(v=>v+1),followers:state.owner===userId?state.followers:0,following:state.owner===userId?state.following:0,loading:Boolean(userId)&&(state.owner!==userId||state.loading),error:state.owner===userId?state.error:''};
}
export function FollowCounts({state}:{state:ReturnType<typeof useSocial>}) {
  return <section className="content social-counts" aria-label="Seguidores"><button className="outline" disabled={state.loading} onClick={state.refresh}>Atualizar seguidores</button>{state.loading?<p role="status">A carregar contagens…</p>:state.error?<p role="alert" className="error">{state.error}</p>:<div className="profile-stats"><div><b>{state.followers}</b><span>Seguidores</span></div><div><b>{state.following}</b><span>A seguir</span></div></div>}</section>;
}
type Member={id:string;name:string;bio:string;avatar_url:string|null;follower_count:number;following_count:number;is_following:boolean};
export function Members({userId,social,onLogin}:{userId?:string;social:ReturnType<typeof useSocial>;onLogin:()=>void}) {
  const [members,setMembers]=useState<Member[]>([]),[offset,setOffset]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{
    const controller=new AbortController();setMembers([]);setError('');
    if(!userId||!supabase)return;
    setLoading(true);const client=supabase;
    void (async()=>{try {
      const {data,error}=await client.rpc('member_directory',{p_limit:24,p_offset:offset}).abortSignal(controller.signal);
      if(error)throw error;
      if(!controller.signal.aborted)setMembers((data||[]).map((member:Member)=>({...member,follower_count:Number(member.follower_count),following_count:Number(member.following_count)})));
    }catch(error){if(!controller.signal.aborted)setError((error as {message?:string}).message||'Não foi possível carregar os membros.');}
    finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>controller.abort();
  },[userId,offset,social.revision]);
  async function toggle(member:Member) {
    if(!userId||!supabase||member.id===userId||lock.current)return;
    lock.current=true;setBusy(member.id);setError('');
    try {
      await changeFollow(supabase,userId,member.id,member.is_following);
      social.refresh();
    }catch(error){if(mounted.current)setError((error as {message?:string}).message||'Não foi possível alterar esta relação.');}
    finally {lock.current=false;if(mounted.current)setBusy('');}
  }
  return <div className="content simple-page"><div className="eyebrow muted">RUN 258 · COMUNIDADE</div><h1>OS NOSSOS <em>MEMBROS.</em></h1>{!userId?<div className="empty"><p>Inicia sessão para conhecer e seguir outros membros.</p><button className="primary" onClick={onLogin}>Iniciar sessão</button></div>:<>
    <FollowCounts state={social}/><div className="activity-actions"><button className="outline" disabled={loading||Boolean(busy)} onClick={social.refresh}>Atualizar membros</button></div>
    {error&&<p role="alert" className="error">{error}</p>}{loading?<p role="status">A carregar membros…</p>:<div className="member-grid">{members.map(member=><article className="card member-card" key={member.id}><ProfileAvatar profile={member}/><h2>{member.name}</h2><p className="profile-bio">{member.bio||'Ainda sem bio.'}</p><p>{member.follower_count} seguidores · {member.following_count} a seguir</p>{member.id===userId?<span>Este é o teu perfil</span>:<button className={member.is_following?'outline':'primary'} disabled={Boolean(busy)} onClick={()=>void toggle(member)}>{busy===member.id?'A guardar…':member.is_following?'Deixar de seguir':'Seguir'}</button>}</article>)}</div>}
    {!loading&&!error&&!members.length&&<p className="empty">Não há mais membros nesta página.</p>}
    <div className="activity-actions"><button className="outline" disabled={loading||Boolean(busy)||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-24))}>Anterior</button><span>Página {offset/24+1}</span><button className="outline" disabled={loading||Boolean(busy)||members.length<24} onClick={()=>setOffset(v=>v+24)}>Seguinte</button></div>
  </>}</div>;
}
