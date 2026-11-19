'use client';
import type { Announcement,ClubEvent } from '@/lib/admin';
import { localDate } from '@/lib/activity-stats';
import { useCommunityRecords } from '@/app/use-community-data';
export const eventFields='id,name,event_date,location,meeting_time,start_time,description';
export const announcementFields='id,title,body,pinned,author_id,created_at';
export function Announcements(){
 const state=useCommunityRecords<Announcement>('announcements',announcementFields,true);
 return <section className="member-board"><div className="eyebrow muted">DA ADMINISTRAÇÃO</div><h2>Anúncios da comunidade</h2>{state.loading?<p role="status">A carregar anúncios…</p>:state.error?<div role="alert"><p className="error">{state.error}</p><button className="outline" onClick={state.reload}>Tentar novamente</button></div>:state.rows.length?<div className="announcement-list">{state.rows.map(row=><article className={'card announcement '+(row.pinned?'is-pinned':'')} key={row.id}>{row.pinned&&<span className="eyebrow">📌 FIXADO</span>}<h3>{row.title}</h3><p className="profile-bio">{row.body}</p></article>)}</div>:<p className="empty">Ainda não há anúncios publicados.</p>}</section>;
}
export function Events({compact=false}:{compact?:boolean}){
 const state=useCommunityRecords<ClubEvent>('events',eventFields);const rows=compact?state.rows.filter(row=>row.event_date>=localDate()).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,3):state.rows;
 const body=<><div className="eyebrow muted">RUN 258 · MEMBROS</div>{compact?<h2>Próximos encontros</h2>:<h1>OS NOSSOS <em>EVENTOS.</em></h1>}{state.loading?<p role="status">A carregar eventos…</p>:state.error?<div role="alert"><p className="error">{state.error}</p><button className="outline" onClick={state.reload}>Tentar novamente</button></div>:rows.length?<div className="event-list">{rows.map(event=><article className="card event-detail" key={event.id}><div><h2>{event.name}</h2><p>{new Date(event.event_date+'T12:00:00').toLocaleDateString('pt-PT')} · {event.location}</p><p>Concentração {event.meeting_time.slice(0,5)} · Partida {event.start_time.slice(0,5)}</p><p className="profile-bio">{event.description}</p></div></article>)}</div>:<p className="empty">{compact?'Ainda não há próximos encontros publicados.':'Ainda não há eventos publicados.'}</p>}</>;
 return compact?<section className="member-board">{body}</section>:<div className="content simple-page">{body}</div>;
}
