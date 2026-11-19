import { redirect, notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { COMMUNITY_ROUTES, CommunityPage, entryUrl } from '@/lib/auth-navigation';
import { getCommunityAccess,activeAdmin } from '@/lib/community-access';
import { CommunityApp } from '@/app/community-app';
export async function renderCommunityPage(page:CommunityPage){
  const client=await createServerSupabase();let user=null;
  if(client){try{const result=await client.auth.getUser();if(!result.error)user=result.data.user;}catch{/* Sem validacao, nao se mostra a comunidade. */}}
  if(!user)redirect(entryUrl(COMMUNITY_ROUTES[page]));
  const access=await getCommunityAccess(client!);
  if(access?.status!=='active')redirect(entryUrl(COMMUNITY_ROUTES[page])+'&error='+encodeURIComponent(access?.status||'access'));
  if(page==='Admin'&&!activeAdmin(access))notFound();
  return <CommunityApp key={user.id} initialUser={user} initialAccess={access!} page={page}/>;
}
