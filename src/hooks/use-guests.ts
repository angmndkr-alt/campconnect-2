import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_URL, tokens, api } from '@/lib/api-client';
import type { GuestRow } from '@/lib/types';

export type { GuestRow };

export function useGuests(eventId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['guests', eventId],
    queryFn: async (): Promise<GuestRow[]> => {
      if (!eventId) return [];
      const list = await api.get<{guests:GuestRow[]}>('/events/' + eventId + '/guests');
      return list.guests ?? [];
    },
    enabled: Boolean(eventId),
  });

  const updateGuest = useMutation({
    mutationFn: async (patch: { guestId: string; status: 'approved' | 'pending_approval' | 'declined' | 'waitlisted' }) => {
      const data = await api.patch<GuestRow>('/events/' + eventId + '/guests/' + patch.guestId + '/status', { status: patch.status });
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
      return data;
    },
  });

  const updateGuestStatus = updateGuest;

  const bulkUpdate = useMutation({
    mutationFn: async (input: string[] | { guestIds: string[]; status?: string }) => {
      const guestIds = Array.isArray(input) ? input : input.guestIds;
      const status = Array.isArray(input) ? 'approved' : input.status || 'approved';
      const selected=(query.data||[]).filter(g=>guestIds.includes(g.id));
      await api.post('/events/'+eventId+'/guests/bulk',{emails:selected.map(g=>g.email),status});
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
    },
  });

  const checkIn = useMutation({
    mutationFn: async (guestId: string) => {
      const data = await api.post<GuestRow>('/events/' + eventId + '/check-ins', {guestId,method:'manual'});
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
      return data;
    },
  });

  const undoCheckIn = useMutation({
    mutationFn: async (guestId: string) => {
      await api.delete('/events/' + eventId + '/check-ins/' + guestId);
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
    },
  });

  const exportCsv=async(_guests:GuestRow[],eventTitle:string)=>{try{await api.get('/auth/session');const response=await fetch(API_URL+'/events/'+eventId+'/guests.csv',{headers:{authorization:'Bearer '+tokens.access}});if(!response.ok)throw new Error('Could not export guests.');const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=eventTitle.replace(/[^a-z0-9]+/gi,'_')+'_guests.csv';link.click();URL.revokeObjectURL(url);}catch(e){toast.error((e as Error).message);}};

  return {
    ...query,
    guests: query.data ?? [],
    updateGuest,
    updateGuestStatus,
    bulkUpdateStatus: bulkUpdate,
    checkIn,
    undoCheckIn,
    exportCsv,
  };
}
