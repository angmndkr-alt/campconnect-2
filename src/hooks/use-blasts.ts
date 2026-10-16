import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Notice } from '@/lib/types';

export function useBlasts(eventId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['blasts', eventId],
    enabled:!!eventId,
    queryFn: async () => {
      const data = await api.get<any>('/admin/events/'+eventId+'/blasts');
      return data.blasts;
    },
  });

  const publishBlast = useMutation({
    mutationFn: async ({ title, body, audience, channel, tone = 'mint', ...rest }: { title: string; body: string; audience: string; channel: string; tone?: string; eventId?: string; subject?: string; messageBody?: string }) => {
      const payload = {
        title: rest.subject ?? title,
        body: rest.messageBody ?? body,
        audience,
        channel,
        tone,
        eventId: rest.eventId ?? eventId,
      };
      const data = await api.post<Notice>('/admin/events/'+eventId+'/blasts', {subject:payload.title,messageBody:payload.body,audience});
      queryClient.invalidateQueries({ queryKey: ['blasts'] });
      return data;
    },
  });

  const sendBlast = publishBlast;

  return { ...query, publishBlast, sendBlast };
}

export function useNotices() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notices'],
    queryFn: async () => {
      const data = await api.get<Notice[]>('/content/notices');
      return data;
    },
  });

  const sendNotice = useMutation({
    mutationFn: async (notice: { title: string; body: string; audience: string }) => {
      const data = await api.post<Notice>('/content/notices', notice);
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      return data;
    },
  });

  return { ...query, sendNotice };
}

export function useAdmins() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const data = await api.get<{ id: string; name: string; email: string; role: string; calendar_id: string | null; club_name: string | null; must_change_password: boolean }[]>('/admin/users');
      return data;
    },
  });

  const updateAdmin = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<{ name: string; department: string; avatar: string }> }) => {
      const data = await api.patch('/admin/users/' + id, patch);
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      return data;
    },
  });

  const deleteAdmin = useMutation({
    mutationFn: async (id: string) => {
      await api.delete('/admin/users/' + id);
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
  });

  return { ...query, updateAdmin, deleteAdmin };
}
