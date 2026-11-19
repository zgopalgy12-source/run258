'use client';
import { useEffect, useRef, useState } from 'react';
import type { useActivities } from '@/app/activities';
import { emptyImage, ImagePicker, StoredPhoto } from '@/app/images';
import { ProfileAvatar } from '@/app/profile';
import { supabase } from '@/lib/supabase';
import { ActivityCard, Channel, changeReaction, ChatMessage, findSentMessage, messageBody, REACTIONS, readChannels, sendChatMessage } from '@/lib/chat';
import { distanceText, paceText, timeText } from '@/lib/activity-stats';
import { removeUnusedImage, UploadedImage, uploadImage } from '@/lib/images';
import { MessageModeration } from '@/app/message-moderation';
import { useChatFeed } from '@/app/use-chat';

export function SharedActivity({card}:{card:ActivityCard}) {
  return <div className="shared-activity"><span>ATIVIDADE PARTILHADA</span><h3>{card.type}</h3><div><b>{distanceText(Number(card.distance))} km</b><span>{timeText(Number(card.duration))}</span><span>{paceText(Number(card.duration)/Number(card.distance))}/km</span></div><small>{new Date(card.date+'T12:00:00Z').toLocaleDateString('pt-PT',{timeZone:'UTC'})}</small></div>;
}
function Composer({userId,channel,reply,onCancelReply,activities,onSent,onBusy}:{userId:string;channel:Channel;reply:ChatMessage|null;onCancelReply:()=>void;activities:ReturnType<typeof useActivities>;onSent:()=>void;onBusy:(busy:boolean)=>void}) {
  const [text,setText]=useState(''),[activity,setActivity]=useState(''),[selection,setSelection]=useState(emptyImage),[saving,setSaving]=useState(false),[error,setError]=useState(''),[pickerKey,setPickerKey]=useState(0);
  const mounted=useRef(true),lock=useRef(false),attempt=useRef<string|null>(null),input=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{attempt.current=null;if(reply)input.current?.focus()},[reply?.id]);
  function completed(){if(!mounted.current)return;attempt.current=null;setText('');setActivity('');setSelection(emptyImage);setPickerKey(v=>v+1);onCancelReply();onSent();}
  async function send(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase||lock.current||selection.busy||selection.error)return;
    setError('');let body:string;
    try{body=messageBody(text,Boolean(selection.image),activity||null);}catch(error){setError((error as Error).message);return;}
    lock.current=true;setSaving(true);onBusy(true);let uploaded:UploadedImage|null=null;
    try {
      if(attempt.current){const existing=await findSentMessage(supabase,attempt.current,userId,channel.id);if(existing){completed();return;}}
      const messageId=attempt.current||crypto.randomUUID();attempt.current=messageId;
      if(selection.image)uploaded=await uploadImage(supabase,userId,selection.image);
      if(!mounted.current){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,userId);return;}
      const result=await sendChatMessage(supabase,{id:messageId,channel_id:channel.id,author_id:userId,body,photo_url:uploaded?.reference||null,activity_id:activity||null,reply_to:reply?.id||null});
      if(uploaded&&result.photo_url!==uploaded.reference)await removeUnusedImage(supabase,uploaded.reference,userId);
      completed();
    }catch(error){if(uploaded)await removeUnusedImage(supabase,uploaded.reference,userId);if(mounted.current)setError((error as {message?:string}).message||'Não foi possível enviar. Os teus dados foram mantidos para tentares novamente.');}
    finally{lock.current=false;if(mounted.current){setSaving(false);onBusy(false);}}
  }
  return <form className="chat-composer" onSubmit={send}>
    {reply&&<div className="reply-target"><span>A responder a <b>{reply.author?.name||'Membro indisponível'}</b>: {reply.body.slice(0,100)||'Foto ou atividade'}</span><button type="button" disabled={saving} onClick={onCancelReply}>Cancelar resposta</button></div>}
    <fieldset disabled={saving} className="activity-fields"><label>Mensagem em #{channel.name}<textarea ref={input} aria-label={`Mensagem em #${channel.name}`} maxLength={4000} rows={3} value={text} onChange={event=>{setText(event.target.value);attempt.current=null}} placeholder="Escreve uma mensagem…"/></label>
      <div className="emoji-picker" aria-label="Adicionar emoji">{['😀','🏃','🎉','🔥','👏','💪'].map(emoji=><button type="button" key={emoji} aria-label={`Adicionar ${emoji}`} onClick={()=>{setText(value=>value.length+emoji.length<=4000?value+emoji:value);attempt.current=null;input.current?.focus()}}>{emoji}</button>)}<small>{text.length}/4000</small></div>
      <ImagePicker key={pickerKey} kind="chat" value={selection} onChange={value=>{setSelection(value);attempt.current=null}} disabled={saving}/>
      <label>Partilhar uma atividade (opcional)<select value={activity} disabled={saving||activities.loading||Boolean(activities.error)} onChange={event=>{setActivity(event.target.value);attempt.current=null}}><option value="">Sem atividade</option>{activities.items.map(item=><option value={item.id} key={item.id}>{item.date} · {item.type} · {distanceText(item.distance)} km</option>)}</select></label>
      {activities.loading&&<p role="status">A carregar atividades…</p>}{activities.error&&<p className="error">Não foi possível carregar as atividades. <button type="button" onClick={activities.reload}>Tentar novamente</button></p>}
      <button type="button" className="text-link" disabled={activities.loading} onClick={activities.reload}>Atualizar atividades</button>
      {!activities.loading&&!activities.error&&!activities.items.length&&<p>Regista uma atividade no Painel para a poderes partilhar aqui.</p>}
      {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={saving||selection.busy||Boolean(selection.error)}>{saving?'A enviar…':'Enviar mensagem'}</button>
    </fieldset>
  </form>;
}
function ChatRoom({userId,channel,activities,isAdmin}:{isAdmin:boolean;userId:string;channel:Channel;activities:ReturnType<typeof useActivities>}) {
  const feed=useChatFeed(userId,channel.id),[reply,setReply]=useState<ChatMessage|null>(null),[reactionError,setReactionError]=useState(''),[reacting,setReacting]=useState(''),[sending,setSending]=useState(false);
  const lock=useRef(false),mounted=useRef(true),viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),sticky=useRef(true),before=useRef<{height:number;top:number}|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{const element=viewport.current;if(!element)return;if(before.current){element.scrollTop=before.current.top+element.scrollHeight-before.current.height;before.current=null;}else if(sticky.current)element.scrollTop=element.scrollHeight;},[feed.messages]);
  useEffect(()=>{if(!content.current)return;const observer=new ResizeObserver(()=>{if(sticky.current&&viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight});observer.observe(content.current);return()=>observer.disconnect()},[]);
  async function react(messageId:string,emoji:string,mine:boolean){
    if(!supabase||lock.current)return;lock.current=true;setReacting(`${messageId}:${emoji}`);setReactionError('');
    try{await changeReaction(supabase,messageId,userId,emoji,mine);feed.refresh();}
    catch(error){if(mounted.current)setReactionError((error as {message?:string}).message||'Não foi possível guardar a reação.');}
    finally{lock.current=false;if(mounted.current)setReacting('');}
  }
  return <div className="chat-main live-chat"><div className="chat-header"><b># {channel.name}</b><span role="status">{feed.connection}</span><div><button className="text-link" disabled={feed.fetching} onClick={feed.refresh}>Atualizar</button>{feed.connection!=='Em tempo real'&&<button className="text-link" onClick={feed.reconnect}>Voltar a ligar</button>}</div></div>
    {feed.pinned.length>0&&<details className="chat-pins" open><summary>📌 Mensagens fixadas ({feed.pinned.length})</summary>{feed.pinned.map(message=><article key={message.id}><b>{message.author?.name||'Membro indisponível'}</b>{message.body&&<p className="chat-text">{message.body}</p>}{message.photo_url&&<StoredPhoto reference={message.photo_url}/ >}{message.activity_card&&<SharedActivity card={message.activity_card}/ >}{isAdmin&&<MessageModeration id={message.id} pinned={true} onChanged={feed.refresh}/>}</article>)}</details>}
    {feed.error&&<div className="chat-alert" role="alert"><p className="error">{feed.error}</p>{feed.messages.length>0&&<p>As mensagens apresentadas podem estar desatualizadas.</p>}<button className="outline" onClick={feed.refresh}>Tentar novamente</button></div>}
    <div className="chat-messages" ref={viewport} onScroll={()=>{const element=viewport.current;if(element)sticky.current=element.scrollHeight-element.scrollTop-element.clientHeight<100}}><div ref={content}>
      {feed.loading?<p className="empty" role="status">A carregar mensagens…</p>:<>
        {feed.hasOlder&&<button className="outline older-messages" disabled={feed.fetching} onClick={()=>{if(viewport.current)before.current={height:viewport.current.scrollHeight,top:viewport.current.scrollTop};sticky.current=false;feed.older()}}>{feed.fetching?'A carregar…':'Carregar mensagens anteriores'}</button>}
        {!feed.error&&!feed.messages.length&&<div className="empty">Ainda não há mensagens em #{channel.name}. Inicia a conversa!</div>}
        {feed.messages.map(message=><article className="chat-message" id={`message-${message.id}`} key={message.id}><ProfileAvatar profile={message.author} small/><div className="chat-message-body"><div className="chat-author"><b>{message.author?.name||'Membro indisponível'}</b><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>{message.pinned&&<span>Fixada</span>}</div>
          {message.reply_to&&<blockquote><b>Resposta a {message.reply?.author?.name||'mensagem indisponível'}</b><p>{message.reply?.body.slice(0,180)|| (message.reply?.photo_url?'Foto':message.reply?.activity_card?'Atividade':'Mensagem indisponível')}</p></blockquote>}
          {message.body&&<p className="chat-text">{message.body}</p>}{message.photo_url&&<StoredPhoto reference={message.photo_url}/>}{message.activity_card&&<SharedActivity card={message.activity_card}/>}
          {isAdmin&&<MessageModeration id={message.id} pinned={message.pinned} onChanged={feed.refresh}/>}
          <div className="chat-message-actions">{REACTIONS.map(emoji=>{const count=feed.reactions.find(r=>r.message_id===message.id&&r.emoji===emoji);return <button type="button" key={emoji} aria-label={`Reagir com ${emoji}, ${count?.total||0} reações`} aria-pressed={count?.mine||false} className={count?.mine?'selected':''} disabled={Boolean(reacting)} onClick={()=>void react(message.id,emoji,count?.mine||false)}>{emoji} {count?.total||0}</button>})}<button type="button" disabled={sending} onClick={()=>setReply(message)}>Responder</button></div>
        </div></article>)}
      </>}
    </div></div>{reactionError&&<p className="error chat-alert" role="alert">{reactionError}</p>}
    <Composer onBusy={setSending} userId={userId} channel={channel} reply={reply} onCancelReply={()=>setReply(null)} activities={activities} onSent={()=>{sticky.current=true;feed.refresh()}}/>
  </div>;
}
export function Chat({userId,activities,onLogin,isAdmin=false}:{isAdmin?:boolean;userId?:string;activities:ReturnType<typeof useActivities>;onLogin:()=>void}) {
  const [channels,setChannels]=useState<Channel[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();if(!userId||!supabase)return;
    const client=supabase;setLoading(true);setError('');
    void (async()=>{try{const data=await readChannels(client,controller.signal);if(!controller.signal.aborted){setChannels(data);setSelected(value=>data.some(c=>c.id===value)?value:data[0].id)}}catch(error){if(!controller.signal.aborted)setError((error as {message?:string}).message||'Não foi possível carregar os canais.');}finally{if(!controller.signal.aborted)setLoading(false)}})();
    return()=>controller.abort();
  },[userId,retry]);
  const current=channels.find(c=>c.id===selected);
  return <div className="content simple-page"><div className="eyebrow muted">A NOSSA COMUNIDADE</div><h1>ESTAMOS <em>JUNTOS.</em></h1><p className="subtitle">Partilha os teus momentos, conquistas e próximos quilómetros.</p>
    {!userId?<div className="empty"><p>Inicia sessão para participar no chat.</p><button className="primary" onClick={onLogin}>Iniciar sessão</button></div>:loading?<p className="empty" role="status">A carregar canais…</p>:error?<div className="empty" role="alert"><p className="error">{error}</p><button className="outline" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button></div>:<div className="chat-layout card"><nav className="channels" aria-label="Canais do chat"><b>CANAIS</b>{channels.map(channel=><button type="button" key={channel.id} className={selected===channel.id?'on':''} aria-current={selected===channel.id?'page':undefined} onClick={()=>setSelected(channel.id)}># <span>{channel.name}</span></button>)}</nav>{current&&<ChatRoom isAdmin={isAdmin} key={`${userId}:${current.id}`} userId={userId} channel={current} activities={activities}/>}</div>}
  </div>;
}
