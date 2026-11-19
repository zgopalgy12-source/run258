import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-navigation';
export async function GET(request:NextRequest){
  const token_hash=request.nextUrl.searchParams.get('token_hash'),type=request.nextUrl.searchParams.get('type'),next=safeNext(request.nextUrl.searchParams.get('next'));
  const client=await createServerSupabase();
  if(token_hash&&client&&type&&['email','signup','invite'].includes(type)){
    try{const {error}=await client.auth.verifyOtp({token_hash,type:type as EmailOtpType});if(!error){const response=NextResponse.redirect(new URL(next,request.nextUrl.origin));response.headers.set('Cache-Control','no-store');return response;}}catch{/* erro apresentado na entrada */}
  }
  const url=new URL('/',request.nextUrl.origin);url.searchParams.set('error','auth');url.searchParams.set('next',next);
  const response=NextResponse.redirect(url);response.headers.set('Cache-Control','no-store');return response;
}
