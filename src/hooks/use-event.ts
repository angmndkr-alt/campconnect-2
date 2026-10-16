import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { mapEvent } from '@/lib/api-models';
export function useEvent(id?:string){return useQuery({queryKey:['event',id],queryFn:async()=>mapEvent(await api.get('/events/'+id)),enabled:!!id,retry:1});}
