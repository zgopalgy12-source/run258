import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-navigation';
export async function GET(request:NextRequest){
  const next=safeNext(request.nextUrl.searchParams.get('next')),code=request.nextUrl.searchParams.get('code');
  const client=await createServerSupabase();
  const token_hash=request.nextUrl.searchParams.get('token_hash'),type=request.nextUrl.searchParams.get('type');
  if(code&&client){try{const {error}=await client.auth.exchangeCodeForSession(code);if(!error){const response=NextResponse.redirect(new URL(next,request.nextUrl.origin));response.headers.set('Cache-Control','no-store');return response;}}catch{/* erro apresentado na entrada */}}
  if(!code&&token_hash&&client&&type&&['email','signup','invite'].includes(type)){
    try{const {error}=await client.auth.verifyOtp({token_hash,type:type as 'email'|'signup'|'invite'});if(!error){const response=NextResponse.redirect(new URL(next,request.nextUrl.origin));response.headers.set('Cache-Control','no-store');return response;}}catch{/* erro apresentado na entrada */}
  }
  const url=new URL('/',request.nextUrl.origin);url.searchParams.set('error','auth');url.searchParams.set('next',next);
  const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');return response;
}
