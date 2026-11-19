import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-navigation';
import { getCommunityAccess } from '@/lib/community-access';
import { Entry } from '@/app/entry';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}) {
  const params=await searchParams,destination=safeNext(params.next);
  const client=await createServerSupabase();
  let authenticated=false;
  if(client){try{const {data,error}=await client.auth.getUser();authenticated=!error&&Boolean(data.user);}catch{/* A entrada continua disponivel se Auth estiver indisponivel. */}}
  const access=authenticated&&client?await getCommunityAccess(client):null;
  if(access?.status==='active')redirect(destination);
  const errorCode=authenticated?(access?.status==='suspended'?'suspended':access?.status==='removed'?'removed':'access'):params.error;
  return <Entry destination={destination} errorCode={errorCode}/>;
}
