import type { SupabaseClient } from '@supabase/supabase-js';
export type CommunityAccess={role:'member'|'admin';status:'active'|'suspended'|'removed'};
export async function getCommunityAccess(client:SupabaseClient):Promise<CommunityAccess|null>{
  try{const {data,error}=await client.rpc('community_access');if(error||!data||!['member','admin'].includes(data.role)||!['active','suspended','removed'].includes(data.status))return null;return data as CommunityAccess;}catch{return null;}
}
export function activeAdmin(access:CommunityAccess|null){return access?.role==='admin'&&access.status==='active'}
