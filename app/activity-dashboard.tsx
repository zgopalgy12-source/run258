'use client';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity as ActivityIcon, Check, ChevronLeft, ChevronRight, Flame, Footprints, Mountain, Plus, Trophy, Users } from 'lucide-react';
import { Activity, distanceText, localDate, monday, shiftDay, paceText, summarize, timeText } from '@/lib/activity-stats';
import type { useActivities } from '@/app/activities';
import { StoredPhoto } from '@/app/images';
import { ActivityPhotoEditor } from '@/app/activity-media';
type State = ReturnType<typeof useActivities>;
const dayLabel=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('pt-PT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
function Status({state,userId,onLogin}:{state:State;userId?:string;onLogin:()=>void}) {
  if(!userId)return <div className="empty"><p>Inicia sessão para ver as tuas atividades.</p><button className="primary" onClick={onLogin}>Iniciar sessão</button></div>;
  if(state.loading)return <p className="empty" role="status">A carregar atividades…</p>;
  if(state.error)return <div className="empty" role="alert"><p className="error">{state.error}</p><button className="outline" onClick={state.reload}>Tentar novamente</button></div>;
  return null;
}
export function ActivityRows({items,onChanged}:{items:Activity[];onChanged:()=>void}) {
  return <div className="activity-list">{items.length?items.map(a=><div className="activity-entry" key={a.id}><div className="activity-row"><div className="activity-icon"><Footprints size={19}/></div><div className="activity-info"><b>{a.type}</b><span>{dayLabel(a.date)} · {a.notes||'Sem notas'}</span></div><div className="activity-stat"><strong>{distanceText(a.distance)} <small>km</small></strong><span>{timeText(a.duration)} · {paceText(a.duration/a.distance)}/km</span><span>{a.elevation} m de elevação</span></div></div>{a.photo_url&&<StoredPhoto reference={a.photo_url}/>}<ActivityPhotoEditor activity={a} onChanged={onChanged}/></div>):<div className="empty">Ainda não há atividades neste período e filtro.</div>}</div>;
}
export function ActivitiesView({state,userId,onLogin,onAdd}:{state:State;userId?:string;onLogin:()=>void;onAdd:()=>void}) {
  return <div className="content simple-page"><div className="eyebrow muted">CADA QUILÓMETRO CONTA</div><h1>AS TUAS <em>ATIVIDADES.</em></h1><div className="activity-actions"><button className="primary" onClick={onAdd}><Plus size={18}/>Registar atividade</button><button className="outline" onClick={state.reload} disabled={state.loading}>Atualizar</button></div><Status state={state} userId={userId} onLogin={onLogin}/>{userId&&!state.loading&&!state.error&&<ActivityRows items={state.items} onChanged={state.reload}/>}</div>;
}
export function ActivityDashboard({state,userId,onLogin,onAdd,onAll}:{state:State;userId?:string;onLogin:()=>void;onAdd:()=>void;onAll:()=>void}) {
  const [filter,setFilter]=useState('Todos'),[week,setWeek]=useState(0);
  const stats=summarize(state.items,localDate(),week,filter);
  const ready=Boolean(userId)&&!state.loading&&!state.error;
  const change=stats.previous.distance>0?`${((stats.weekly.distance-stats.previous.distance)/stats.previous.distance*100).toLocaleString('pt-PT',{maximumFractionDigits:1,signDisplay:'always'})}% vs. semana anterior`:'Sem distância na semana anterior';
  return <div className="content"><div className="welcome-row"><div><div className="eyebrow"><span className="dot"/> O TEU ESPAÇO, O TEU RITMO</div><h1>VAMOS MAIS <em>LONGE.</em></h1><p className="subtitle">Acompanha os quilómetros que registaste na tua conta.</p></div><button className="primary desktop-add" onClick={onAdd}><Plus size={18}/>Registar atividade</button></div>
    <div className="sport-row"><div className="sport-tabs">{Object.entries({Todos:ActivityIcon,Corrida:Footprints,Caminhada:Users,'Trail Run':Mountain}).map(([name,Icon])=><button key={name} className={filter===name?'selected':''} onClick={()=>setFilter(name)}><Icon size={16}/>{name}</button>)}</div><button className="outline" disabled={state.loading} onClick={state.reload}>Atualizar</button></div>
    <Status state={state} userId={userId} onLogin={onLogin}/>
    {ready&&<>
      <section className="card activity-history"><div className="eyebrow muted">TODO O HISTÓRICO · {filter.toUpperCase()}</div><div className="profile-stats"><div><b>{stats.allTime.count}</b><span>Atividades</span></div><div><b>{distanceText(stats.allTime.distance)} km</b><span>Distância total</span></div><div><b>{timeText(stats.allTime.duration)}</b><span>Tempo total</span></div><div><b>{stats.allTime.elevation} m</b><span>Elevação total</span></div></div></section>
      <div className="dashboard-grid"><div className="left-column">
        <section className="card weekly"><div className="section-head"><div><div className="eyebrow muted">O TEU RESUMO</div><h2>{week===0?'Esta semana':'Resumo semanal'}</h2></div><div className="week-control"><button aria-label="Semana anterior" onClick={()=>setWeek(v=>v-1)}><ChevronLeft size={17}/></button><span>{dayLabel(stats.start)} – {dayLabel(stats.end)}</span><button aria-label="Semana seguinte" disabled={week===0} onClick={()=>setWeek(v=>Math.min(0,v+1))}><ChevronRight size={17}/></button></div></div>
          <div className="metrics"><div><span>Distância</span><strong>{distanceText(stats.weekly.distance)} <small>km</small></strong><p>{change}</p></div><div><span>Tempo em movimento</span><strong className="real-time">{timeText(stats.weekly.duration)}</strong><p>{stats.weekly.count} atividade(s)</p></div><div><span>Ganho de elevação</span><strong>{stats.weekly.elevation} <small>m</small></strong><p>Elevação registada</p></div></div>
        </section>
        <section className="card chart-card"><div className="section-head"><div><div className="eyebrow muted">CONSISTÊNCIA É TUDO</div><h2>O teu progresso</h2><p>12 semanas até à semana selecionada · {filter}</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.chart} margin={{top:15,right:10,left:-15,bottom:0}}><CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="week" tickFormatter={value=>dayLabel(value).replace(/ de \d{4}/,'')} stroke="var(--color-text-secondary)" tickLine={false} axisLine={false} fontSize={10} interval={2}/><YAxis stroke="var(--color-text-secondary)" tickLine={false} axisLine={false} fontSize={10} domain={[0,'auto']}/><Tooltip labelFormatter={value=>`Semana de ${dayLabel(String(value))}`} formatter={value=>[`${distanceText(Number(value))} km`,'Distância']} contentStyle={{background:'var(--color-elevated)',border:'1px solid var(--color-border)',borderRadius:8,color:'var(--color-text)'}}/><Area type="linear" dataKey="km" stroke="var(--color-accent)" strokeWidth={3} fill="var(--color-accent-soft)" dot={false}/></AreaChart></ResponsiveContainer></div><div className="chart-note"><span>SEMANA SELECIONADA</span><strong>{distanceText(stats.weekly.distance)} <small>km</small></strong></div></section>
        <section className="activities-section"><div className="section-head"><h2>Atividades da semana</h2><button className="text-link" onClick={onAll}>Ver todas →</button></div><ActivityRows items={stats.recent} onChanged={state.reload}/></section>
      </div><div className="right-column">
        <section className="streak-card"><div className="streak-top"><Flame size={21}/><span>CONSISTÊNCIA ATUAL</span></div><h3>{stats.streak?'Continua a':'Vamos'}<br/><em>somar!</em></h3><div className="streak-number">{stats.streak} <span>semana(s)<br/>seguida(s)</span></div><div className="days">{['S','T','Q','Q','S','S','D'].map((day,i)=><div key={i}><span>{day}</span><b className={stats.days[i]?'done':''} aria-label={`${dayLabel(shiftDay(monday(localDate()),i))}: ${stats.days[i]?'com atividade':'sem atividade'}`}>{stats.days[i]?<Check size={13}/>:''}</b></div>)}</div><p>Dias com atividade nesta semana. O streak conta semanas consecutivas; a semana atual vazia ainda não quebra a sequência.</p></section>
        <section className="card records"><div className="section-head"><div><div className="eyebrow muted">TODO O HISTÓRICO · {filter.toUpperCase()}</div><h2>Recordes pessoais</h2></div><Trophy size={20} color="var(--color-accent)"/></div><div className="record"><div><span>Melhor ritmo médio</span><strong>{paceText(stats.bestPace)} <small>{stats.bestPace===null?'':'/km'}</small></strong></div></div><div className="record"><div><span>Maior distância</span><strong>{stats.longest===null?'—':distanceText(stats.longest)} <small>{stats.longest===null?'':'km'}</small></strong></div></div><p>Recordes por atividade no filtro selecionado.</p></section>
      </div></div>
    </>}
  </div>;
}
