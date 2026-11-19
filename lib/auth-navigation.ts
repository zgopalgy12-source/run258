export const COMMUNITY_ROUTES = {
  'Início':'/inicio', 'Painel':'/painel', 'Atividades':'/atividades', 'Chat':'/chat',
  'Perfil':'/perfil', 'Membros':'/membros', 'Eventos':'/eventos', 'Admin':'/admin'
} as const;
export type CommunityPage=keyof typeof COMMUNITY_ROUTES;
export function isCommunityPath(path:string) {
  return Object.values(COMMUNITY_ROUTES).some(route=>path===route||path.startsWith(route+'/'));
}
export function safeNext(value:string|null|undefined,fallback='/inicio') {
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(value))return fallback;
  try {
    const target=new URL(value,'https://run258.invalid');
    if(target.origin!=='https://run258.invalid'||!isCommunityPath(target.pathname))return fallback;
    const decoded=decodeURIComponent(target.pathname);
    if(/[\\\u0000-\u0020\u007f]/.test(decoded)||decoded.startsWith('//'))return fallback;
    return target.pathname+target.search+target.hash;
  } catch {return fallback;}
}
export function entryUrl(path:string) {return '/?next='+encodeURIComponent(safeNext(path));}
