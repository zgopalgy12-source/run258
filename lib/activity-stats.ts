export type Activity = { id: string; user_id: string; type: string; date: string; distance: number; duration: number; elevation: number; notes: string; photo_url?: string | null };
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
export function shiftDay(day: string, amount: number) {
  const value = new Date(day + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0,10);
}
export function monday(day: string) {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay(); return shiftDay(day, -((weekday + 6) % 7));
}
export const distanceText = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
export function timeText(seconds: number) {
  const s = Math.round(seconds); return `${Math.floor(s/3600)}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}min ${String(s%60).padStart(2,'0')}s`;
}
export function paceText(secondsPerKm: number | null) {
  if (secondsPerKm === null) return '—';
  const s = Math.round(secondsPerKm); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
export function summarize(items: Activity[], today: string, offset = 0, filter = 'Todos') {
  const all = items.filter(a => a.date <= today && (filter === 'Todos' || a.type === filter));
  const start = shiftDay(monday(today), offset * 7), end = shiftDay(start, 6);
  const inWeek = (day: string) => all.filter(a => a.date >= day && a.date <= shiftDay(day,6));
  const total = (rows: Activity[]) => rows.reduce((v,a) => ({distance:v.distance+a.distance, duration:v.duration+a.duration, elevation:v.elevation+a.elevation, count:v.count+1}), {distance:0,duration:0,elevation:0,count:0});
  const weekly = total(inWeek(start)), previous = total(inWeek(shiftDay(start,-7)));
  const chart = Array.from({length:12},(_,i) => {
    const day = shiftDay(start,(i-11)*7); return {week:day, km:total(inWeek(day)).distance};
  });
  const weeks = new Set(all.map(a => monday(a.date)));
  let cursor = monday(today), streak = 0;
  if (!weeks.has(cursor)) cursor = shiftDay(cursor,-7);
  while (weeks.has(cursor)) { streak++; cursor = shiftDay(cursor,-7); }
  const currentStart = monday(today);
  const days = Array.from({length:7},(_,i) => all.some(a => a.date === shiftDay(currentStart,i)));
  return { start, end, weekly, previous, chart, streak, days, allTime:total(all),
    currentDistance:total(inWeek(currentStart)).distance,
    bestPace:all.length ? all.reduce((v,a)=>Math.min(v,a.duration/a.distance),Infinity) : null,
    longest:all.length ? all.reduce((v,a)=>Math.max(v,a.distance),0) : null,
    recent:all.filter(a=>a.date>=start && a.date<=end).slice(0,3) };
}
