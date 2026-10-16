import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { mapEvent, mapUser, mapAlbum, mapNotice, mapMessage, eventInput } from './api-models';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokens, type ApiError } from './api-client';
import type { CommunityMessage, GuestRow, Notice, PhotoAlbum, User } from './types';
import type { CampEvent } from './types';

export type Role = 'student' | 'admin';
export { PhotoAlbum };

export type Auth = {
  role: 'student' | 'admin';
  email: string;
  name: string;
  adminId?: string;
  studentCode?: string;
  club_name?: string | null;
};

export type EventItem = {
  id: string | number;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  organizer: string;
  hosting: string;
  links: string;
  goals: string;
  requirements: string;
  ticket_type: string;
  status: 'active' | 'published' | 'draft' | 'cancelled';
  cover_url: string | null;
  thumbail_url: string | null;
  attendee_count: number;
  capacity: number | null;
  color: string | null;
  tone: string;
  image: string;
  slug: string | null;
  registered_count: number;
  stats: Record<string, number> | null;
  calendar_id: string;
  calendar: { id: string; name: string; tone: string; description: string; cover_url: string | null };
  owner: string | null;
  club: string;
  attendees: number;
  registrations: Array<{ name: string; department: string; year: string }>;
  xp: number;
  requires_approval: boolean;
  ticket_types?: Array<{ id: string; name: string; price: number; ticket_kind: string }>;
  registration_questions?: Array<{ id: string | number; label: string; required: boolean }>;
  createdAt: string;
  updatedAt: string;
};

export type Club = {
  id: string;
  name: string;
  description: string;
  tone: string;
  cover_url: string | null;
  member_count: number;
  created_at: string;
  admins: User[];
};

export const clubNames = ['CESA & CSI', 'MESA', 'ECSA', 'ITSA', 'AIML', 'Students Council'];

export function toEventItem(raw: CampEvent): EventItem {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    category: raw.category,
    date: raw.date,
    time: raw.time,
    venue: raw.venue,
    organizer: raw.organizer,
    hosting: raw.hosting,
    links: raw.links,
    goals: raw.goals,
    requirements: raw.requirements,
    ticket_type: raw.ticket_type,
    status: raw.status,
    cover_url: raw.cover_url,
    thumbail_url: raw.thumbnail_url,
    attendee_count: raw.attendee_count,
    capacity: raw.capacity,
    color: raw.color,
    tone: raw.tone,
    image: raw.image,
    slug: raw.slug,
    registered_count: raw.registered_count,
    stats: raw.stats,
    calendar_id: raw.calendar_id,
    calendar: raw.calendar ?? { id: raw.calendar_id, name: '', tone: '', description: '', cover_url: null },
    owner: (raw as any).owner_id ?? null,
    club: raw.calendar?.name ?? 'Campus Club',
    attendees: raw.stats?.going_count ?? raw.attendee_count ?? 0,
    registrations: [],
    xp: raw.xp ?? 0,
    requires_approval: raw.requires_approval ?? false,
    ticket_types: raw.ticket_types,
    registration_questions: raw.registration_questions?.map((q) => ({
      id: q.id,
      label: q.label ?? q.question ?? '',
      required: (q as any).required ?? true,
    })),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Consumer-facing store shape. */
export type Store = {
  auth: Auth | null;
  profile: any;
  studentStats: {attended:number;xp:number};
  leaderboard: any[];
  calendars: any[];
  refreshData: () => Promise<void>;
  updateProfile: (patch: {fullName?:string;department?:string;avatarUrl?:string}) => Promise<void>;
  markNoticesRead: (id?:number) => void;
  readNotices: number[];
  loading: boolean;
  error: string | null;
  loginStudent: (email: string, password: string, name?: string) => Promise<string | void>;
  loginAdmin: (email: string, password: string) => Promise<string | void>;
  loginSuperAdmin: (email: string, password: string) => Promise<void>;
  logout: () => void;
  admins: User[];
  changePassword: (adminId: string, current: string, next: string) => Promise<string>;
  setFirstPassword: (adminId: string, next: string) => Promise<void>;
  updateAdmin: (id: string, patch: { name?: string; department?: string; avatar?: string | null }) => Promise<void>;
  events: EventItem[];
  createEvent: (body: Partial<EventItem> & { title: string }) => Promise<EventItem>;
  deleteEvent: (id: string | number) => Promise<void>;
  registrations: string[];
  register: (eventId: string | number) => Promise<void>;
  unregister: (eventId: string | number) => Promise<void>;
  attendeeCount: (event: EventItem) => number;
  messages: CommunityMessage[];
  addMessage: (channel: string, text: string) => Promise<CommunityMessage>;
  albums: PhotoAlbum[];
  saveAlbum: (album: PhotoAlbum) => Promise<PhotoAlbum>;
  uploadAlbum: (album: Omit<PhotoAlbum, 'id'>) => Promise<PhotoAlbum>;
  deleteAlbum: (id: number) => Promise<void>;
  setCover: (id: number, cover: string) => Promise<void>;
  notices: Notice[];
  sendNotice: (title: string, body: string, audience: string) => Promise<Notice>;
  followed: string[];
  toggleFollow: (clubId: string) => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  photos: number;
  activity: string[];
  notificationCount: number;
  registrationCount: number;
};

/** React context exposed to consumers via `useCampStore()`. */
const StoreContext = createContext<Store | null>(null);

export function CampStoreProvider({ children }: { children: ReactNode }) {
  const queryClient=useQueryClient();
  const [studentStats,setStudentStats]=useState({attended:0,xp:0});
  const [leaderboard,setLeaderboard]=useState<any[]>([]);
  const [auth,setAuth]=useState<Auth|null>(null);
  const [profile,setProfile]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [admins,setAdmins]=useState<User[]>([]);
  const [calendars,setCalendars]=useState<any[]>([]);
  const [events,setEvents]=useState<EventItem[]>([]);
  const [registrations,setRegistrations]=useState<string[]>([]);
  const [albums,setAlbums]=useState<PhotoAlbum[]>([]);
  const [messages,setMessages]=useState<CommunityMessage[]>([]);
  const [notices,setNotices]=useState<Notice[]>([]);
  const [followed,setFollowed]=useState<string[]>([]);
  const [activity,setActivity]=useState<string[]>([]);
  const [readNotices,setReadNotices]=useState<number[]>(()=>JSON.parse(localStorage.getItem('cc-read-notices')||'[]'));
  const [theme,setTheme]=useState<'light'|'dark'>(()=>localStorage.getItem('cc-theme')==='light'?'light':'dark');
  useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');},[theme]);
  const guarded=async <T,>(work:()=>Promise<T>):Promise<T>=>{try{return await work();}catch(e){const message=e instanceof Error?e.message:'The request failed.';setError(message);toast.error(message);throw e;}};
  const refreshData=useCallback(async()=>{
    const [cs,es,als,ns,chs]=await Promise.all([api.get<any>('/calendars'),api.get<any>('/events?range=all'),api.get<any>('/gallery'),api.get<any>('/announcements'),api.get<any>('/channels')]);
    setCalendars(cs.calendars);
    const ranks=await api.get<any>('/students/leaderboard');setLeaderboard(ranks.leaderboard);
    const fullEvents=await Promise.all(es.events.map((e:any)=>api.get<any>('/events/'+e.id)));
    setEvents(fullEvents.map((e:any)=>toEventItem(mapEvent(e))));
    setAlbums(als.albums.map(mapAlbum));setNotices(ns.announcements.map(mapNotice));
    const chat=await Promise.all(chs.channels.map(async(c:any)=>{const d=await api.get<any>('/channels/'+c.id+'/messages');return d.messages.map((m:any)=>mapMessage(m,c.slug));}));setMessages(chat.flat());
    if(tokens.access){
      const {profile:p}=await api.get<any>('/auth/session');setProfile(p);
      const counts=await api.get<any>('/student-stats');setStudentStats(counts.stats);
      let managed:any[]=[];
      if(p.role!=='student'){const d=await api.get<any>('/dashboard');managed=d.clubs;setActivity(d.activity.map((x:any)=>x.action+' · '+(x.details||'')));}
      const calendar=managed[0];const u=mapUser(p,calendar);
      setAuth({role:u.role,email:u.email,name:u.name,adminId:u.role==='admin'?u.id:undefined,club_name:u.club});
      setAdmins([u]);
      if(p.role==='super_admin'){const data=await api.get<any>('/admin/users');setAdmins(data.users.map((x:any)=>mapUser(x,cs.calendars.find((c:any)=>x.calendars?.includes(c.id)))));}
      const following=await api.get<any>('/calendars/me/follows');setFollowed(following.follows.map((id:string)=>cs.calendars.find((c:any)=>c.id===id)?.name||id));
      const mine=await Promise.all(es.events.map(async(e:any)=>{const d=await api.get<any>('/events/'+e.id+'/registrations/me');return d.guest&&!d.guest.is_invalidated&&d.guest.status!=='declined'?e.id:null;}));setRegistrations(mine.filter(Boolean));
    }else{setAuth(null);setProfile(null);setAdmins([]);setRegistrations([]);setFollowed([]);}
  },[]);
  useEffect(()=>{refreshData().catch(e=>{setError(e.message);toast.error(e.message);}).finally(()=>setLoading(false));const update=()=>refreshData().catch(e=>setError(e.message));window.addEventListener('campconnect:auth',update);window.addEventListener('focus',update);const timer=setInterval(update,30000);return()=>{window.removeEventListener('campconnect:auth',update);window.removeEventListener('focus',update);clearInterval(timer);};},[refreshData]);
  const invalidate=async()=>{await refreshData();await queryClient.invalidateQueries();};
  const signIn=async(path:string,email:string,password:string,name?:string)=>{try{const data=await api.post<any>(path,{email,password,...(name?{fullName:name}:{})},{anonymous:true});tokens.set(data.accessToken,data.refreshToken);queryClient.clear();await refreshData();return undefined;}catch(e){return e instanceof Error?e.message:'Sign in failed.';}};
  const loginStudent=(email:string,password:string,name?:string)=>signIn(name?'/auth/signup':'/auth/login',email,password,name);
  const loginAdmin=(email:string,password:string)=>signIn('/auth/admin/login',email,password);
  const loginSuperAdmin=async(email:string,password:string)=>{const error=await loginAdmin(email,password);if(error)throw new Error(error);};
  const logout=()=>{const token=tokens.refresh;tokens.clear();setAuth(null);setProfile(null);setAdmins([]);setRegistrations([]);setFollowed([]);queryClient.clear();api.post('/auth/logout',{refreshToken:token},{anonymous:true}).catch(()=>{});};
  const setFirstPassword=async(_id:string,next:string)=>guarded(async()=>{await api.post('/auth/first-login-password',{newPassword:next});await refreshData();});
  const changePassword=async(_id:string,current:string,next:string)=>{try{await api.post('/auth/change-password',{currentPassword:current,newPassword:next});await refreshData();return 'Password updated.';}catch(e){return e instanceof Error?e.message:'Password update failed.';}};
  const updateProfile=async(patch:any)=>guarded(async()=>{await api.patch('/auth/me',patch);await refreshData();});
  const updateAdmin=async(_id:string,patch:any)=>updateProfile({fullName:patch.name,department:patch.department,avatarUrl:patch.avatar});
  const createEvent=async(body:any)=>guarded(async()=>{const host=admins.find(a=>a.id===auth?.adminId);const payload={...eventInput({...body,calendar_id:body.calendar_id||host?.calendar_id}),tickets:body.ticket_types||[],questions:body.registration_questions||[]};const editing=body.id&&body.id!==-1;const res=editing?await api.patch<any>('/events/'+body.id,payload):await api.post<any>('/events',payload);await invalidate();return toEventItem(mapEvent(await api.get<any>('/events/'+res.event.id)));});
  const deleteEvent=async(id:string|number)=>guarded(async()=>{await api.delete('/events/'+id);await invalidate();});
  const register=async(eventId:string|number)=>guarded(async()=>{if(!profile)throw new Error('Sign in before registering.');await api.post('/events/'+eventId+'/registrations',{fullName:profile.full_name,email:profile.email,department:profile.department||'',year:profile.year_or_designation||''});await invalidate();});
  const unregister=async(eventId:string|number)=>guarded(async()=>{const {guest}=await api.get<any>('/events/'+eventId+'/registrations/me');if(!guest)throw new Error('Registration not found.');await api.delete('/events/'+eventId+'/registrations/'+guest.id);await invalidate();});
  const attendeeCount=(e:EventItem)=>e.attendees;
  const saveAlbum=async(album:PhotoAlbum)=>guarded(async()=>{const host=admins.find(a=>a.id===auth?.adminId);const payload={title:album.title,eventName:album.event,date:album.date,description:album.description,calendarId:host?.calendar_id||undefined,coverUrl:album.cover,photoUrls:album.photos};if(album.id!==-1)await api.patch('/gallery/'+album.id,payload);else await api.post('/gallery',payload);await invalidate();return album;});
  const uploadAlbum=async(album:Omit<PhotoAlbum,'id'>)=>saveAlbum({...album,id:-1});
  const deleteAlbum=async(id:number)=>guarded(async()=>{await api.delete('/gallery/'+id);await invalidate();});
  const setCover=async(id:number,cover:string)=>guarded(async()=>{await api.patch('/gallery/'+id,{coverUrl:cover});await invalidate();});
  const addMessage=async(channel:string,text:string)=>guarded(async()=>{const {channels}=await api.get<any>('/channels');const c=channels.find((c:any)=>c.slug===channel);if(!c)throw new Error('Channel not found.');const {message}=await api.post<any>('/channels/'+c.id+'/messages',{text});await invalidate();return mapMessage(message,channel);});
  const sendNotice=async(title:string,body:string,audience:string)=>guarded(async()=>{const host=admins.find(a=>a.id===auth?.adminId);const {announcement}=await api.post<any>('/admin/announcements',{title,body,audience,calendarId:host?.calendar_id||undefined});await invalidate();return mapNotice(announcement);});
  const toggleFollow=async(name:string)=>guarded(async()=>{const c=calendars.find(c=>c.name===name||c.id===name);if(!c)throw new Error('Club not found.');await api.post('/calendars/'+c.id+'/follow');await invalidate();});
  const markNoticesRead=(id?:number)=>{const ids=id===undefined?notices.map(n=>n.id):Array.from(new Set([...readNotices,id]));setReadNotices(ids);localStorage.setItem('cc-read-notices',JSON.stringify(ids));};
  const toggleTheme=()=>setTheme(t=>{const next=t==='dark'?'light':'dark';localStorage.setItem('cc-theme',next);return next;});
  const photos=albums.filter(a=>a.owner===auth?.adminId).reduce((n,a)=>n+a.photos.length,0);
  const notificationCount=notices.filter(n=>n.owner===auth?.adminId).length;
  const registrationCount=events.filter(e=>e.owner===auth?.adminId).reduce((n,e)=>n+e.attendees,0);
  const value:Store={auth,profile,studentStats,leaderboard,calendars,refreshData,updateProfile,readNotices,markNoticesRead,loading,error,admins,events,registrations,albums,messages,notices,followed,activity,theme,photos,notificationCount,registrationCount,loginStudent,loginAdmin,loginSuperAdmin,logout,setFirstPassword,changePassword,updateAdmin,createEvent,deleteEvent,register,unregister,attendeeCount,saveAlbum,uploadAlbum,deleteAlbum,setCover,addMessage,sendNotice,toggleFollow,toggleTheme};
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useCampStore():Store {const ctx=useContext(StoreContext);if(!ctx)throw new Error('Missing CampStoreProvider');return ctx;}
