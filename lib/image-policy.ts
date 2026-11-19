export type ImageKind = 'avatar' | 'activity' | 'chat';
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const IMAGE_RULES = {avatar:{edge:512,bytes:256*1024,bucket:'avatars'},activity:{edge:1920,bytes:1024*1024,bucket:'activity-photos'},chat:{edge:1920,bytes:1024*1024,bucket:'photos'}} as const;
export function validateImage(file:{type:string;size:number}) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolhe uma imagem JPEG, PNG ou WebP.');
  if(file.size<=0 || file.size>MAX_INPUT_BYTES) throw new Error('A imagem original deve ter até 10 MiB e não pode estar vazia.');
}
export function scaledDimensions(width:number,height:number,edge:number) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>MAX_PIXELS) throw new Error('Imagem inválida ou superior a 40 megapíxeis.');
  const scale=Math.min(1,edge/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function parseImageRef(value:string|null|undefined) {
  const match=value?.match(/^storage:\/\/(avatars|activity-photos|photos)\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.jpg)$/i);
  return match?{bucket:match[1],owner:match[2],path:`${match[2]}/${match[3]}`}:null;
}
