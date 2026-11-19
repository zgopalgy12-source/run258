import type { SupabaseClient } from '@supabase/supabase-js';
import { getCommunityAccess,activeAdmin } from './community-access';
import { parseImageRef } from './image-policy';
import { removeUnusedImage } from './images';
export type ClubEvent={id:string;name:string;event_date:string;location:string;meeting_time:string;start_time:string;description:string};
export type Announcement={id:string;title:string;body:string;pinned:boolean;author_id:string;created_at:string};
export type AdminMember={id:string;name:string;bio:string;avatar_url:string|null;email:string|null;role:'member'|'admin';status:'active'|'suspended'|'removed';moderation_reason:string|null;created_at:string};
export function eventPayload(data:FormData){
 const name=String(data.get('name')||'').trim(),day=String(data.get('event_date')||''),location=String(data.get('location')||'').trim(),start=String(data.get('start_time')||''),meeting=String(data.get('meeting_time')||start),description=String(data.get('description')||'').trim();
 if(!name||name.length>150||!location||location.length>300||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(meeting)||description.length>5000)throw new Error('Confirma nome, data, local e horas válidas.');
 return {name,event_date:day,location,meeting_time:meeting,start_time:start,description};
}
export function announcementPayload(data:FormData){const title=String(data.get('title')||'').trim(),body=String(data.get('body')||'').trim();if(!title||title.length>120||!body||body.length>5000)throw new Error('Preenche título (até 120 caracteres) e texto (até 5000).');return {title,body,pinned:data.get('pinned')==='on'};}
export async function requireAdmin(client:SupabaseClient){if(!activeAdmin(await getCommunityAccess(client)))throw new Error('Acesso reservado a administradores ativos.');}
export async function saveEvent(client:SupabaseClient,data:ReturnType<typeof eventPayload>,id?:string){await requireAdmin(client);const result=id?await client.from('events').update(data).eq('id',id).select('id').single():await client.from('events').insert(data).select('id').single();if(result.error)throw result.error;}
export async function deleteEvent(client:SupabaseClient,id:string){await requireAdmin(client);const {error}=await client.from('events').delete().eq('id',id).select('id').single();if(error)throw error;}
export async function saveAnnouncement(client:SupabaseClient,data:ReturnType<typeof announcementPayload>,userId:string,id?:string){await requireAdmin(client);const result=id?await client.from('announcements').update(data).eq('id',id).select('id').single():await client.from('announcements').insert({...data,author_id:userId}).select('id').single();if(result.error)throw result.error;}
export async function setAnnouncementPinned(client:SupabaseClient,id:string,pinned:boolean){await requireAdmin(client);const {error}=await client.from('announcements').update({pinned}).eq('id',id).select('id').single();if(error)throw error;}
export async function deleteAnnouncement(client:SupabaseClient,id:string){await requireAdmin(client);const {error}=await client.from('announcements').delete().eq('id',id).select('id').single();if(error)throw error;}
export async function setMessagePinned(client:SupabaseClient,id:string,pinned:boolean){await requireAdmin(client);const {error}=await client.from('messages').update({pinned}).eq('id',id).select('id').single();if(error)throw error;}
export async function deleteModeratedMessage(client:SupabaseClient,id:string){
 await requireAdmin(client);const current=await client.from('messages').select('id,photo_url').eq('id',id).single();if(current.error)throw current.error;
 const removed=await client.from('messages').delete().eq('id',id).select('id').single();if(removed.error)throw removed.error;
 const image=parseImageRef(current.data.photo_url);if(image)return removeUnusedImage(client,current.data.photo_url,image.owner);return true;
}
export async function moderateMember(client:SupabaseClient,target:AdminMember,status:AdminMember['status'],reason:string,userId:string){
 if(target.id===userId||target.role==='admin')throw new Error('Não é permitido moderar a própria conta ou outro administrador.');
 await requireAdmin(client);const {error}=await client.rpc('admin_moderate_member',{p_target:target.id,p_status:status,p_reason:reason.trim()});if(error)throw error;
}
