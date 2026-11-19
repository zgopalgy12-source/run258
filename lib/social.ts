import type { SupabaseClient } from '@supabase/supabase-js';
export async function changeFollow(client:SupabaseClient,userId:string,targetId:string,following:boolean) {
  if(userId===targetId)throw new Error('Não podes seguir o teu próprio perfil.');
  const result=following?await client.from('follows').delete().eq('follower_id',userId).eq('following_id',targetId):await client.from('follows').insert({follower_id:userId,following_id:targetId});
  if(result.error&&result.error.code!=='23505')throw result.error;
}
export async function readFollowCounts(client:SupabaseClient,userId:string,signal:AbortSignal) {
  const [followers,following]=await Promise.all([
    client.from('follows').select('*',{count:'exact',head:true}).eq('following_id',userId).abortSignal(signal),
    client.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',userId).abortSignal(signal)
  ]);
  if(followers.error)throw followers.error;if(following.error)throw following.error;
  if(followers.count===null||following.count===null)throw new Error('Não foi possível confirmar as contagens.');
  return {followers:followers.count,following:following.count};
}
