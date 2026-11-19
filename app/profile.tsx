'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { emptyImage, ImagePicker, useImageUrl } from '@/app/images';
import { uploadImage, removeUnusedImage, UploadedImage } from '@/lib/images';

type Profile = { id: string; name: string; bio: string; avatar_url: string | null };
const fields = 'id,name,bio,avatar_url';

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const activeId = useRef(userId);
  activeId.current = userId;
  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError('');
    setLoading(Boolean(userId));
    if (!userId || !supabase) { setLoading(false); return; }
    const client = supabase;
    void (async () => {
      try {
        const { data, error } = await client.from('profiles').select(fields).eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('O perfil desta conta ainda não existe. Executa o SQL da fase 1 e tenta novamente.');
        if (!cancelled) setProfile(data);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : (error as {message?: string}).message || 'Não foi possível carregar o perfil.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, attempt]);
  return { profile: profile?.id === userId ? profile : null, loading, error,
    retry: () => setAttempt(value => value + 1),
    saved: (value: Profile) => { if (activeId.current === value.id) setProfile(value); } };
}

export function ProfileAvatar({ profile, small = false }: { profile: Profile | null; small?: boolean }) {
  const image = useImageUrl(profile?.avatar_url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = profile?.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M';
  return <span className={'avatar ' + (small ? 'small' : '')}>
    {image.url && failedUrl !== image.url
      ? <img src={image.url} alt={`Avatar de ${profile?.name}`} referrerPolicy="no-referrer" onError={() => setFailedUrl(image.url)} />
      : initials}
  </span>;
}

export function ProfilePanel({ user, state, onLogin }: { user: User | null; state: ReturnType<typeof useProfile>; onLogin: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selection, setSelection] = useState(emptyImage);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !supabase || lock.current || selection.busy || selection.error) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const bio = String(form.get('bio') || '').trim();
    let avatar = form.get('remove_avatar') ? null : state.profile?.avatar_url || null;
    const oldAvatar = state.profile?.avatar_url || null;
    setError(''); setNotice('');
    if (!name || name.length > 100 || bio.length > 1000) {
      setError('Preenche um nome (até 100 caracteres), uma bio até 1000 caracteres.'); return;
    }
    lock.current=true;setSaving(true);
    let uploaded:UploadedImage|null=null;
    try {
      if(selection.image){uploaded=await uploadImage(supabase,user.id,selection.image);avatar=uploaded.reference;}
      if(!mounted.current){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,user.id);return;}
      const { data, error } = await supabase.from('profiles').update({ name, bio, avatar_url: avatar || null }).eq('id', user.id).select(fields).single();
      if (error) throw error;
      state.saved(data);
      const cleaned = oldAvatar && oldAvatar!==avatar ? await removeUnusedImage(supabase,oldAvatar,user.id) : true;
      if (mounted.current) { setEditing(false);setSelection(emptyImage); setNotice(cleaned ? 'Perfil guardado com sucesso.' : 'Perfil guardado. Não foi possível apagar a imagem anterior.'); }
    } catch (error) {
      if(uploaded)await removeUnusedImage(supabase,uploaded.reference,user.id);
      if (mounted.current) setError((error as {message?: string}).message || 'Não foi possível guardar. Tenta novamente.');
    } finally { lock.current=false;if (mounted.current) setSaving(false); }
  }
  return <div className="content simple-page">
    <div className="eyebrow muted">A TUA CONTA</div><h1>O TEU <em>PERFIL.</em></h1>
    {!user ? <div className="card profile-account"><p>Inicia sessão para ver e editar o teu perfil.</p><button className="primary" onClick={onLogin}>Iniciar sessão</button></div>
      : <>
        <div className="profile-account"><span>{user.email}</span><button className="outline" onClick={async () => {
          const result = await supabase?.auth.signOut();
          if (result?.error) setError(result.error.message);
        }}>Terminar sessão</button></div>
        {state.loading && <p role="status">A carregar o perfil…</p>}
        {state.error && <div role="alert" className="error"><p>{state.error}</p><button className="outline" onClick={state.retry}>Tentar novamente</button></div>}
        {state.profile && <>
          <div className="profile-banner"><ProfileAvatar profile={state.profile}/><div><div className="eyebrow">MEMBRO RUN 258</div><h2>{state.profile.name}</h2><p className="profile-bio">{state.profile.bio || 'Ainda não adicionaste uma bio.'}</p></div><button className="outline" disabled={saving} onClick={() => { setEditing(!editing);setSelection(emptyImage); setError(''); setNotice(''); }}>{editing ? 'Cancelar' : 'Editar perfil'}</button></div>
          {editing && <section className="card profile-editor"><h2>Editar perfil</h2><form onSubmit={save}>
            <label>Nome<input name="name" autoComplete="name" defaultValue={state.profile.name} required maxLength={100} disabled={saving}/></label>
            <label>Bio<textarea name="bio" defaultValue={state.profile.bio} maxLength={1000} disabled={saving}/></label>
            <ImagePicker kind="avatar" value={selection} onChange={setSelection} disabled={saving}/>
            {state.profile.avatar_url&&<label className="checkbox"><input type="checkbox" name="remove_avatar" disabled={saving||Boolean(selection.image)}/> Remover avatar atual</label>}
            <button className="primary" disabled={saving||selection.busy||Boolean(selection.error)}>{saving ? 'A guardar…' : 'Guardar perfil'}</button>
          </form></section>}
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </>}
  </div>;
}
