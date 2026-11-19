'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { safeNext } from '@/lib/auth-navigation';
import { Logo } from '@/app/logo';
export function Entry({destination,errorCode}:{destination:string;errorCode?:string}) {
  const [mode,setMode]=useState<'Entrar'|'Criar conta'|''>(''),[busy,setBusy]=useState(false),[error,setError]=useState(errorCode==='suspended'?'A tua conta está suspensa. Contacta @run258_club.':errorCode==='removed'?'A tua conta foi removida da comunidade. Contacta @run258_club.':errorCode==='access'?'Não foi possível confirmar o acesso. Executa o SQL atualizado ou contacta a administração.':errorCode==='config'?'Configura o Supabase no .env.local.':errorCode==='auth'?'Não foi possível concluir a autenticação. Tenta entrar novamente.':''),[notice,setNotice]=useState('');
  const next=safeNext(destination);
  function open(value:'Entrar'|'Criar conta'){setMode(value);setError('');setNotice('')}
  async function authenticate(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;if(!supabase){setError('Configura o Supabase no .env.local.');return;}
    const data=new FormData(event.currentTarget);setBusy(true);setError('');setNotice('');
    try {
      const email=String(data.get('email')).trim(),password=String(data.get('password'));
      const callback=new URL('/auth/callback',window.location.origin);callback.searchParams.set('next',next);
      const result=mode==='Entrar'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password,options:{emailRedirectTo:callback.toString()}});
      if(result.error)throw result.error;
      if(result.data.session){window.location.assign(next);return;}
      setNotice('Conta criada. Confirma o teu email para entrar na comunidade. Depois da confirmação, voltas à página que pediste.');
    }catch(error){setError((error as {message?:string}).message||'Não foi possível entrar. Tenta novamente.');}
    finally{setBusy(false);}
  }
  return <main className="public-entry"><div className="entry-card"><Logo/><div className="eyebrow">RUN 258 · MAPUTO</div><h1>CADA <em>KM CONTA.</em></h1><p className="entry-slogan">O teu próximo melhor começa aqui.</p><p>Uma comunidade para todos os ritmos. Entra para partilhar os teus quilómetros e correr connosco.</p><div className="hero-buttons"><button className="primary" onClick={()=>open('Criar conta')}>Criar conta</button><button className="outline" onClick={()=>open('Entrar')}>Entrar</button></div><a className="entry-instagram" href="https://instagram.com/run258_club" target="_blank" rel="noreferrer">Instagram @run258_club</a>
    {error&&!mode&&<p className="error" role="alert">{error}</p>}
    {['suspended','removed','access'].includes(errorCode||'')&&<button className="outline" onClick={async()=>{await supabase?.auth.signOut({scope:'local'});window.location.replace('/')}}>Sair desta conta</button>}
    {mode&&<section className="entry-auth"><h2>{mode}</h2><form onSubmit={authenticate}><label>Email<input type="email" name="email" autoComplete="email" required disabled={busy}/></label><label>Palavra-passe<input type="password" name="password" autoComplete={mode==='Entrar'?'current-password':'new-password'} minLength={6} required disabled={busy}/></label>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<button className="primary" disabled={busy}>{busy?'A aguardar…':mode}</button></form>
    <button className="outline" disabled={busy} onClick={async()=>{
      if(!supabase){setError('Configura o Supabase no .env.local.');return;}setBusy(true);setError('');
      try{const callback=new URL('/auth/callback',window.location.origin);callback.searchParams.set('next',next);const result=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback.toString()}});if(result.error)throw result.error;}
      catch(error){setError((error as {message?:string}).message||'Não foi possível continuar com Google.');setBusy(false);}
    }}>Continuar com Google</button><button className="switch" disabled={busy} onClick={()=>open(mode==='Entrar'?'Criar conta':'Entrar')}>{mode==='Entrar'?'Ainda não tens conta? Criar conta':'Já tens conta? Entrar'}</button></section>}
  </div></main>;
}
