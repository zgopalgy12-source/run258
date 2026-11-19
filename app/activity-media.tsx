'use client';
import { useEffect, useRef, useState } from 'react';
import type { Activity } from '@/lib/activity-stats';
import { supabase } from '@/lib/supabase';
import { emptyImage, ImagePicker } from '@/app/images';
import { removeUnusedImage, UploadedImage, uploadImage } from '@/lib/images';
export function ActivityPhotoEditor({activity,onChanged}:{activity:Activity;onChanged:()=>void}) {
  const [open,setOpen]=useState(false),[selection,setSelection]=useState(emptyImage),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  async function save(remove=false) {
    if(!supabase||lock.current||(!remove&&(!selection.image||selection.busy||selection.error)))return;
    lock.current=true;setSaving(true);setError('');let uploaded:UploadedImage|null=null;
    try {
      if(!remove)uploaded=await uploadImage(supabase,activity.user_id,selection.image!);
      if(!mounted.current){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,activity.user_id);return;}
      const {error}=await supabase.from('activities').update({photo_url:uploaded?.reference || null}).eq('id',activity.id).eq('user_id',activity.user_id).select('id').single();
      if(error)throw error;
      if(activity.photo_url)await removeUnusedImage(supabase,activity.photo_url,activity.user_id);
      if(mounted.current){setOpen(false);setSelection(emptyImage);}onChanged();
    } catch(error){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,activity.user_id);if(mounted.current)setError((error as {message?:string}).message||'Não foi possível guardar a foto.');}
    finally {lock.current=false;if(mounted.current)setSaving(false);}
  }
  return <div className="activity-photo-editor"><button className="text-link" type="button" disabled={saving} onClick={()=>{setOpen(!open);setError('');setSelection(emptyImage)}}>{open?'Cancelar':activity.photo_url?'Alterar foto':'Adicionar foto'}</button>
    {open&&<div className="card photo-editor"><ImagePicker kind="activity" value={selection} onChange={setSelection} disabled={saving}/><div className="activity-actions"><button type="button" className="primary" disabled={saving||!selection.image||selection.busy||Boolean(selection.error)} onClick={()=>void save()}>{saving?'A guardar…':'Guardar foto'}</button>{activity.photo_url&&<button type="button" className="outline" disabled={saving||selection.busy} onClick={()=>void save(true)}>Remover foto</button>}</div></div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
