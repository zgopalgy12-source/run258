'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { emptyImage, ImagePicker } from '@/app/images';
import { uploadImage, removeUnusedImage, UploadedImage } from '@/lib/images';
import { Activity, localDate } from '@/lib/activity-stats';
import { activityFields as fields, readOwnActivities } from '@/lib/activity-repository';
export function useActivities(userId?: string) {
  const [result,setResult] = useState<{owner?:string; items:Activity[]; loading:boolean; error:string}>({items:[],loading:false,error:''});
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    if (!userId || !supabase) {setResult({items:[],loading:false,error:''});return;}
    const client = supabase;
    setResult({owner:userId,items:[],loading:true,error:''});
    void (async()=>{
      try {
        const items=await readOwnActivities(client,userId,controller.signal);
        if(!controller.signal.aborted) setResult({owner:userId,items,loading:false,error:''});
      } catch(error) {if(!controller.signal.aborted) setResult({owner:userId,items:[],loading:false,error:(error as {message?:string}).message || 'Não foi possível carregar as atividades.'});}
    })();
    return ()=>controller.abort();
  },[userId,revision]);
  return {items:result.owner===userId?result.items:[], loading:Boolean(userId) && (result.owner!==userId || result.loading), error:result.owner===userId?result.error:'', reload:()=>setRevision(v=>v+1)};
}
export function ActivityForm({userId,onSaved,onLogin}:{userId?:string;onSaved:()=>void;onLogin:()=>void}) {
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const [selection,setSelection]=useState(emptyImage);
  const lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  if(!userId) return <><h2>REGISTAR ATIVIDADE</h2><p>Inicia sessão para guardar atividades na tua conta.</p><button className="primary" onClick={onLogin}>Iniciar sessão</button></>;
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(lock.current || !supabase || selection.busy || selection.error) return;
    const f=new FormData(event.currentTarget),day=String(f.get('date')),type=String(f.get('type'));
    const distance=Number(f.get('distance')),minutes=Number(f.get('minutes')),elevation=Number(f.get('elevation'));
    const notes=String(f.get('notes')||'').trim();
    setError('');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day || day>localDate() || !['Corrida','Caminhada','Trail Run'].includes(type) || !Number.isFinite(distance) || distance<=0 || !Number.isFinite(minutes) || minutes<=0 || Math.round(minutes*60)<1 || Math.round(minutes*60)>2147483647 || !Number.isInteger(elevation) || elevation<0 || elevation>2147483647 || notes.length>5000) {setError('Confirma os valores: data válida até hoje, distância e duração positivas, elevação inteira não negativa e notas até 5000 caracteres.');return;}
    lock.current=true;setSaving(true);
    let uploaded:UploadedImage|null=null;
    try {
      if(selection.image)uploaded=await uploadImage(supabase,userId!,selection.image);
      if(!mounted.current){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,userId!);return;}
      const {error}=await supabase.from('activities').insert({user_id:userId,type,date:day,distance,duration:Math.round(minutes*60),elevation,notes,source:'manual',photo_url:uploaded?.reference || null}).select(fields).single();
      if(error) throw error;
      if(mounted.current) onSaved();
    } catch(error) {if(uploaded)await removeUnusedImage(supabase,uploaded.reference,userId!);if(mounted.current)setError((error as {message?:string}).message || 'Não foi possível guardar a atividade.');}
    finally {lock.current=false;if(mounted.current)setSaving(false);}
  }
  return <><div className="eyebrow">MAIS UM PARA A CONTA</div><h2>REGISTAR <em>ATIVIDADE.</em></h2><p>Guarda os quilómetros na tua conta.</p><form onSubmit={save}><fieldset disabled={saving} className="activity-fields"><label>Tipo de atividade<select name="type"><option>Corrida</option><option>Caminhada</option><option>Trail Run</option></select></label><div className="form-grid"><label>Data<input type="date" name="date" defaultValue={localDate()} max={localDate()} required/></label><label>Distância (km)<input type="number" name="distance" min="0.01" step="0.01" required/></label><label>Duração (minutos)<input type="number" name="minutes" min="0.1" step="0.1" required/></label><label>Elevação (m)<input type="number" name="elevation" min="0" step="1" defaultValue="0" required/></label></div><label>Notas<textarea name="notes" maxLength={5000}/></label><ImagePicker kind="activity" value={selection} onChange={setSelection} disabled={saving}/>{error&&<p className="error" role="alert">{error}</p>}<button className="primary full" disabled={saving||selection.busy||Boolean(selection.error)}>{saving?'A guardar…':'Guardar atividade'}</button></fieldset></form></>;
}
