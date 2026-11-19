'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, CalendarDays, Check, ChevronDown, Compass, Footprints, Instagram, LayoutDashboard, LogOut, Shield, MessageCircle, Plus, UserRound, Users, X, Zap } from 'lucide-react';
import { Logo } from '@/app/logo';
import { supabase } from '@/lib/supabase';
import { COMMUNITY_ROUTES, CommunityPage, entryUrl } from '@/lib/auth-navigation';
import { ProfilePanel, ProfileAvatar, useProfile } from '@/app/profile';
import { ActivityForm, useActivities } from '@/app/activities';
import { ActivityDashboard, ActivitiesView } from '@/app/activity-dashboard';
import { Members, FollowCounts, useSocial } from '@/app/members';
import { Chat } from '@/app/chat';
import { Events,Announcements } from '@/app/events';
import { AdminPanel } from '@/app/admin-panel';
import { CommunityAccess,getCommunityAccess,activeAdmin } from '@/lib/community-access';
import { createRefreshQueue } from '@/lib/chat';
export function CommunityApp({initialUser,initialAccess,page}:{initialUser:User;initialAccess:CommunityAccess;page:CommunityPage}){
  const router=useRouter(),[user,setUser]=useState<User|null>(initialUser),[modal,setModal]=useState(''),[saved,setSaved]=useState(false),[error,setError]=useState('');
  const [access,setAccess]=useState<CommunityAccess|null>(initialAccess);
  const profileState=useProfile(user?.id),activities=useActivities(user?.id),social=useSocial(user?.id);
  useEffect(()=>{
    if(!supabase)return;
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session&&session.user.id!==initialUser.id){setUser(null);window.location.replace('/inicio');return;}setUser(session?.user||null);if(!session)window.location.replace('/')});
    const restore=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload()};
    window.addEventListener('pageshow',restore);
    return()=>{data.subscription.unsubscribe();window.removeEventListener('pageshow',restore)};
  },[]);
  useEffect(()=>{
    if(!supabase)return;const client=supabase;let active=true;
    const queue=createRefreshQueue(async()=>{const value=await getCommunityAccess(client);if(!active)return;setAccess(value);if(value&&value.status!=='active')window.location.replace('/?error='+value.status);else if(value&&page==='Admin'&&!activeAdmin(value))window.location.replace('/inicio');},()=>{if(active)setAccess(null)});
    const refresh=()=>void queue.request();refresh();
    const subscription=client.channel('run258-access-'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:'id=eq.'+initialUser.id},refresh).subscribe();
    const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
    return()=>{active=false;queue.stop();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);void client.removeChannel(subscription)};
  },[initialUser.id,page]);
  const go=(name:CommunityPage)=>router.push(COMMUNITY_ROUTES[name]);
  const login=()=>window.location.assign(entryUrl(COMMUNITY_ROUTES[page]));
  async function logout(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error){setError(error.message);return;}setUser(null);window.location.replace('/')}
  const nav:readonly (readonly [CommunityPage,typeof Compass])[]=[['Início',Compass],['Painel',LayoutDashboard],['Chat',MessageCircle],['Perfil',UserRound],['Membros',Users],['Eventos',CalendarDays],...(activeAdmin(access)?[['Admin',Shield] as const]:[])];
  if(!user||access?.status==='suspended'||access?.status==='removed')return null;
  if(!access)return <main className="content"><p className="error" role="alert">Não foi possível confirmar o acesso à comunidade.</p><button className="outline" onClick={()=>window.location.reload()}>Tentar novamente</button><button className="outline" onClick={()=>void logout()}>Sair</button></main>;
  return <div className="shell"><aside className="sidebar"><Logo/><div className="side-label">MENU PRINCIPAL</div><nav>{nav.map(([name,Icon])=><button key={name} className={'nav-item '+(page===name?'active':'')} onClick={()=>go(name)}><Icon size={19}/><span>{name}</span></button>)}</nav><div className="sidebar-bottom"><div className="side-promo"><div className="promo-icon"><Zap size={17}/></div><b>Cada km conta.</b><p>O teu próximo melhor começa aqui.</p><button onClick={()=>setModal('activity')}>Registar atividade <ArrowRight size={14}/></button></div><button className="side-user" onClick={()=>go('Perfil')}><ProfileAvatar profile={profileState.profile}/><span><b>{profileState.profile?.name||'Membro Run 258'}</b><small>Ver perfil</small></span><ChevronDown size={16}/></button></div></aside>
  <main className="main"><header className="topbar"><div className="mobile-logo"><Logo/></div><div className="breadcrumbs">RUN 258 <span>/</span><strong>{page.toUpperCase()}</strong></div><div className="top-actions"><button className="top-avatar" aria-label="Abrir perfil" onClick={()=>go('Perfil')}><ProfileAvatar profile={profileState.profile} small/></button><button className="text-link" onClick={()=>void logout()}><LogOut size={16}/> Sair</button></div></header>
  {error&&<p className="error content" role="alert">{error}</p>}
  {page==='Início'&&<div className="content landing"><div className="landing-hero"><div className="eyebrow">BEM-VINDO À COMUNIDADE</div><h1>JUNTOS VAMOS<br/><em>MAIS LONGE.</em></h1><p>Cada km conta. O teu próximo melhor começa aqui.</p><div className="hero-buttons"><button className="primary" onClick={()=>go('Painel')}>Ver o meu painel <ArrowRight size={17}/></button><button className="outline" onClick={()=>go('Chat')}>Abrir chat</button></div><div className="hero-big">258</div></div><section className="landing-section"><div className="eyebrow muted">PARA TODOS OS RITMOS</div><h2>O IMPORTANTE É <em>IRMOS JUNTOS.</em></h2><div className="pace-grid">{['Caminhada','Corrida','Trail Run'].map(name=><div className="card pace-card" key={name}><Footprints size={25}/><h3>{name}</h3><p>Cada passo conta na comunidade Run 258.</p></div>)}</div></section><div className="activity-actions"><button className="outline" onClick={()=>go('Membros')}>Conhecer os membros</button><button className="outline" onClick={()=>go('Eventos')}>Ver eventos da comunidade</button></div><Announcements/><Events compact/><footer>RUN 258 · MAPUTO <a href="https://instagram.com/run258_club" target="_blank" rel="noreferrer"><Instagram size={18}/> @run258_club</a></footer></div>}
  {page==='Painel'&&<ActivityDashboard key={user.id} state={activities} userId={user.id} onLogin={login} onAdd={()=>setModal('activity')} onAll={()=>go('Atividades')}/>}
  {page==='Atividades'&&<ActivitiesView state={activities} userId={user.id} onLogin={login} onAdd={()=>setModal('activity')}/>}
  {page==='Perfil'&&<><ProfilePanel key={user.id} user={user} state={profileState} onLogin={login}/><FollowCounts state={social}/><ActivitiesView state={activities} userId={user.id} onLogin={login} onAdd={()=>setModal('activity')}/></>}
  {page==='Chat'&&<Chat isAdmin={activeAdmin(access)} key={user.id} userId={user.id} activities={activities} onLogin={login}/>}
  {page==='Membros'&&<Members key={user.id} userId={user.id} social={social} onLogin={login}/>}
  {page==='Eventos'&&<Events/>}
  {page==='Admin'&&activeAdmin(access)&&<AdminPanel userId={user.id}/>}
  </main><nav className="bottom-nav">{nav.map(([name,Icon])=><button key={name} className={page===name?'active':''} onClick={()=>go(name)}><Icon size={20}/><span>{name}</span></button>)}</nav><button className="mobile-add" aria-label="Registar atividade" onClick={()=>setModal('activity')}><Plus size={24}/></button>
  {saved&&<div className="toast"><Check size={16}/> Guardado com sucesso!</div>}
  {modal==='activity'&&<div className="modal-backdrop" onMouseDown={()=>setModal('')}><div className="modal" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" aria-label="Fechar" onClick={()=>setModal('')}><X size={20}/></button><ActivityForm key={user.id} userId={user.id} onLogin={login} onSaved={()=>{activities.reload();setModal('');setSaved(true);setTimeout(()=>setSaved(false),3500)}}/></div></div>}
  </div>;
}
