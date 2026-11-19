import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_RULES, ImageKind, parseImageRef, scaledDimensions, validateImage } from './image-policy';
export type PreparedImage={blob:Blob;width:number;height:number;originalBytes:number;kind:ImageKind};
export async function prepareImage(file:File,kind:ImageKind):Promise<PreparedImage> {
  validateImage(file);
  let bitmap:ImageBitmap;
  try {bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});} catch {throw new Error('Não foi possível abrir a imagem. Usa um JPEG, PNG ou WebP válido.');}
  try {
    const rule=IMAGE_RULES[kind];let {width,height}=scaledDimensions(bitmap.width,bitmap.height,rule.edge);
    const canvas=document.createElement('canvas');
    for(let step=0;step<8;step++) {
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw new Error('O navegador não conseguiu preparar a imagem.');
      context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
      for(const quality of [.84,.72,.6,.48,.36]) {
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(!blob)throw new Error('Falhou a compressão da imagem.');
        if(blob.size<=rule.bytes)return {blob,width,height,originalBytes:file.size,kind};
      }
      width=Math.max(1,Math.floor(width*.8));height=Math.max(1,Math.floor(height*.8));
    }
    throw new Error('Não foi possível reduzir a imagem ao limite permitido.');
  } finally {bitmap.close();}
}
export type UploadedImage={reference:string;bucket:string;path:string};
export async function uploadImage(client:SupabaseClient,userId:string,image:PreparedImage):Promise<UploadedImage> {
  const rule=IMAGE_RULES[image.kind];
  if(image.blob.type!=='image/jpeg'||image.blob.size>rule.bytes)throw new Error('A imagem preparada excede os limites de upload.');
  const path=`${userId}/${crypto.randomUUID()}.jpg`;
  const {error}=await client.storage.from(rule.bucket).upload(path,image.blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
  if(error)throw error;
  return {reference:`storage://${rule.bucket}/${path}`,bucket:rule.bucket,path};
}
// Nunca apaga uma imagem ainda referenciada, nem se a confirmação falhar.
export async function removeUnusedImage(client:SupabaseClient,reference:string|null,userId:string):Promise<boolean> {
  const image=parseImageRef(reference);if(!image || image.owner!==userId)return true;
  const table=image.bucket==='avatars'?'profiles':image.bucket==='photos'?'messages':'activities',column=image.bucket==='avatars'?'avatar_url':'photo_url';
  try {
    const {data,error}=await client.from(table).select('id').eq(column,reference).limit(1);
    if(error || !data || data.length>0)return false;
    const removed=await client.storage.from(image.bucket).remove([image.path]);return !removed.error;
  } catch {return false;}
}
