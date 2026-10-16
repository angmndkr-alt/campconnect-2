import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useCalendars() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['calendars'],
    queryFn: async () => {
      const data = await api.get<{ id: string; name: string; description: string; tone: string; cover_url: string | null }[]>('/calendars');
      return data;
    },
  });

  const createCalendar = useMutation({
    mutationFn: async (name: string) => {
      const data = await api.post<{ id: string; name: string }>('/calendars', { name });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      return data;
    },
  });

  const deleteCalendar = useMutation({
    mutationFn: async (id: string) => {
      await api.delete('/calendars/' + id);
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
    },
  });

  const followCalendar = useMutation({
    mutationFn: async (calendarId: string) => {
      await api.post('/calendars/follow', { calendarId });
    },
  });

  return { ...query, createCalendar, deleteCalendar, followCalendar };
}
