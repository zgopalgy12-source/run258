import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isCommunityPath, safeNext } from '@/lib/auth-navigation';
import { getCommunityAccess,activeAdmin,CommunityAccess } from '@/lib/community-access';
function noCache(response:NextResponse) {
  response.headers.set('Cache-Control','private, no-store, max-age=0, must-revalidate');
  response.headers.append('Vary','Cookie');return response;
}
export async function middleware(request:NextRequest) {
  let response=NextResponse.next({request});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let authenticated=false;let access:CommunityAccess|null=null;
  if(url&&key) {
    const client=createServerClient(url,key,{cookies:{
      getAll(){return request.cookies.getAll()},
      setAll(values){
        values.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }});
    try {const {data,error}=await client.auth.getUser();authenticated=!error&&Boolean(data.user);if(authenticated)access=await getCommunityAccess(client);}
    catch {authenticated=false;}
  }
  if(isCommunityPath(request.nextUrl.pathname)&&(!authenticated||access?.status!=='active')) {
    const destination=request.nextUrl.clone();destination.pathname='/';destination.search='';
    destination.searchParams.set('next',safeNext(request.nextUrl.pathname+request.nextUrl.search));
    if(!url||!key)destination.searchParams.set('error','config');
    else if(authenticated)destination.searchParams.set('error',access?.status==='suspended'?'suspended':access?.status==='removed'?'removed':'access');
    const redirect=NextResponse.redirect(destination);
    response.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie));
    return noCache(redirect);
  }
  if((request.nextUrl.pathname==='/admin'||request.nextUrl.pathname.startsWith('/admin/'))&&!activeAdmin(access)){
    const denied=new NextResponse('Acesso reservado a administradores.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    response.cookies.getAll().forEach(cookie=>denied.cookies.set(cookie));return noCache(denied);
  }
  return noCache(response);
}
export const config={matcher:['/','/inicio/:path*','/painel/:path*','/atividades/:path*','/chat/:path*','/perfil/:path*','/membros/:path*','/eventos/:path*','/admin/:path*']};
