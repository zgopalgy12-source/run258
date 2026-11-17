insert into public.channels(name) values ('geral'),('vitórias'),('momentos'),('eventos') on conflict do nothing;
insert into public.events(name,event_date,location,meeting_time,start_time,description) values ('Shakeout · Véspera dos 10 km','2026-11-14','Campo das Acácias, Maputo','05:15','05:30','Vamos correr juntos antes dos 10 km!');
