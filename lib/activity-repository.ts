import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity } from './activity-stats';
export const activityFields = 'id,user_id,type,date,distance,duration,elevation,notes,photo_url';
export async function readOwnActivities(client:SupabaseClient, userId:string, signal:AbortSignal):Promise<Activity[]> {
  const items:Activity[]=[]; let count=Infinity;
  while(items.length<count) {
    const {data,error,count:total}=await client.from('activities').select(activityFields,{count:'exact'}).eq('user_id',userId).order('date',{ascending:false}).order('id',{ascending:false}).range(items.length,items.length+499).abortSignal(signal);
    if(error) throw error;
    if(total===null) throw new Error('Não foi possível confirmar o total de atividades. Tenta novamente.');
    count=total;
    if(!data?.length && items.length<count) throw new Error('A lista de atividades ficou incompleta. Tenta novamente.');
    items.push(...(data||[]).map(a=>({...a,distance:Number(a.distance),duration:Number(a.duration),elevation:Number(a.elevation)})));
  }
  return items;
}
