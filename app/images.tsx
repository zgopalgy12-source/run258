'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseImageRef, ImageKind } from '@/lib/image-policy';
import { prepareImage, PreparedImage } from '@/lib/images';
export type ImageSelection={image:PreparedImage|null;busy:boolean;error:string};
export const emptyImage:ImageSelection={image:null,busy:false,error:''};
export function ImagePicker({kind,value,onChange,disabled=false}:{kind:ImageKind;value:ImageSelection;onChange:(value:ImageSelection)=>void;disabled?:boolean}) {
  const [preview,setPreview]=useState('');const nonce=useRef(0),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!value.image){setPreview('');return;}const url=URL.createObjectURL(value.image.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[value.image]);
  useEffect(()=>()=>{nonce.current++;},[]);
  return <div className="image-picker"><label>{kind==='avatar'?'Carregar avatar':kind==='chat'?'Foto da mensagem (opcional)':'Foto da atividade (opcional)'}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={async event=>{
    const file=event.target.files?.[0];const token=++nonce.current;if(!file){onChange(emptyImage);return;}
    onChange({image:null,busy:true,error:''});
    try {const image=await prepareImage(file,kind);if(token===nonce.current)onChange({image,busy:false,error:''});}
    catch(error){if(token===nonce.current)onChange({image:null,busy:false,error:(error as Error).message});}
  }}/></label><p>JPEG, PNG ou WebP até 10 MiB. {kind==='avatar'?'Até 512 px e 256 KiB':'Até 1920 px e 1 MiB'} depois de comprimir.</p>
  {value.busy&&<p role="status">A comprimir imagem…</p>}{value.error&&<p role="alert" className="error">{value.error}</p>}
  {preview&&value.image&&<><img className="image-preview" src={preview} alt="Pré-visualização da imagem selecionada"/><p>{value.image.width} × {value.image.height} px · {Math.ceil(value.image.blob.size/1024)} KiB (original: {Math.ceil(value.image.originalBytes/1024)} KiB)</p></>}
  {(value.image||value.error)&&<button type="button" className="outline" disabled={disabled} onClick={()=>{nonce.current++;if(input.current)input.current.value='';onChange(emptyImage)}}>Limpar seleção</button>}
  </div>;
}
export function useImageUrl(reference:string|null|undefined) {
  const [result,setResult]=useState<{ref?:string|null;url:string;error:boolean}>({url:'',error:false});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true,objectUrl='';const image=parseImageRef(reference);
    if(!image){setResult({ref:reference,url:reference?.startsWith('https://')?reference:'',error:Boolean(reference&&!reference.startsWith('https://'))});return;}
    setResult({ref:reference,url:'',error:false});
    void(async()=>{
      try{
        if(!supabase)throw new Error('Sem sessão');
        const {data,error}=await supabase.storage.from(image.bucket).download(image.path);
        if(error)throw error;
        if(active){objectUrl=URL.createObjectURL(data);setResult({ref:reference,url:objectUrl,error:false});}
      }catch{if(active)setResult({ref:reference,url:'',error:true});}
    })();
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[reference,retry]);
  return {url:result.ref===reference?result.url:'',error:result.ref===reference&&result.error,retry:()=>setRetry(v=>v+1)};
}
export function StoredPhoto({reference}:{reference:string}) {
  const image=useImageUrl(reference),[failed,setFailed]=useState('');
  if(image.error || (image.url&&failed===image.url))return <div className="photo-failure">Não foi possível carregar a foto. <button type="button" onClick={()=>{setFailed('');image.retry()}}>Tentar novamente</button></div>;
  return image.url?<a href={image.url} target="_blank" rel="noreferrer"><img className="activity-photo" src={image.url} alt="Foto da atividade" loading="lazy" onError={()=>setFailed(image.url)}/></a>:<p role="status">A carregar foto…</p>;
}
