import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export type ScanResult = {
  success: boolean;
  message: string;
  guest?: { full_name: string; email: string };
} | null;

export function useCheckIn(eventId?: string) {
  const queryClient = useQueryClient();
  const [scanResult, setScanResult] = useState<ScanResult>(null);

  const checkIn = useMutation({
    mutationFn: async ({ guestId, method }: { guestId: string; method: 'qr_scan' | 'manual' }) => {
      const data = await api.post<{ id: string; checked_in_at: string }>('/events/' + eventId + '/check-ins', { guestId, method });
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
      queryClient.invalidateQueries({queryKey:['event',eventId]});
      return data;
    },
  });

  const undoCheckIn = useMutation({
    mutationFn: async (guestId: string) => {
      await api.delete('/events/' + eventId + '/check-ins/' + guestId);
      queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
      queryClient.invalidateQueries({queryKey:['event',eventId]});
    },
  });

  const verifyAndCheckInToken = useMutation({
    mutationFn: async ({ tokenOrId }: { tokenOrId: string }) => {
      try {
        let data:any;
        try{data=await api.post('/events/'+eventId+'/check-ins',{qrToken:tokenOrId,method:'qr_scan'});}catch(e){if((e as any).status!==404||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tokenOrId))throw e;data=await api.post('/events/'+eventId+'/check-ins',{guestId:tokenOrId,method:'manual'});}

        queryClient.invalidateQueries({ queryKey: ['guests', eventId] });
      queryClient.invalidateQueries({queryKey:['event',eventId]});
        const ok: Exclude<ScanResult, null> = { success: true, guest:data.guest, message: (data as any).alreadyCheckedIn ? 'This guest was already checked in.' : 'Guest verified and checked in.' };
        setScanResult(ok);
        return data;
      } catch (e) {
        const fail: Exclude<ScanResult, null> = { success: false, message: e instanceof Error ? e.message : 'Verification failed.' };
        setScanResult(fail);
        throw e;
      }
    },
  });

  return { checkIn, undoCheckIn, verifyAndCheckInToken, scanResult, clearScanResult: () => setScanResult(null) };
}
