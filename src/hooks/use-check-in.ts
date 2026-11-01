import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export type ScanResult = {
  success: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  guest?: {
    id?: string;
    full_name: string;
    email: string;
    department?: string | null;
    year?: string | null;
    status?: string;
    checked_in_at?: string | null;
    qr_token?: string;
  };
  ticketName?: string | null;
  eventTitle?: string | null;
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

        if (data.alreadyCheckedIn) {
          const rejected: Exclude<ScanResult, null> = {
            success: false,
            alreadyCheckedIn: true,
            guest: data.guest,
            ticketName: data.ticketName,
            eventTitle: data.eventTitle,
            message: `Pass already used! ${data.guest?.full_name || 'This guest'} was already checked in.`,
          };
          setScanResult(rejected);
          return data;
        }

        const ok: Exclude<ScanResult, null> = {
          success: true,
          alreadyCheckedIn: false,
          guest: data.guest,
          ticketName: data.ticketName,
          eventTitle: data.eventTitle,
          message: `Checked in successfully: ${data.guest?.full_name || 'Guest'}`,
        };
        setScanResult(ok);
        return data;
      } catch (e) {
        const fail: Exclude<ScanResult, null> = {
          success: false,
          alreadyCheckedIn: false,
          message: e instanceof Error ? e.message : 'Verification failed.',
        };
        setScanResult(fail);
        throw e;
      }
    },
  });

  return { checkIn, undoCheckIn, verifyAndCheckInToken, scanResult, clearScanResult: () => setScanResult(null) };
}
