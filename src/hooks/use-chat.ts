import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { CommunityMessage } from '@/lib/types';

export function useChat() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['chat', 'general'],
    queryFn: async () => {
      const data = await api.get<CommunityMessage[]>('/chat/general');
      return data;
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ channel, text }: { channel: string; text: string }) => {
      const data = await api.post<CommunityMessage>('/chat', { channel, text });
      queryClient.invalidateQueries({ queryKey: ['chat', 'general'] });
      return data;
    },
  });

  return { ...query, sendMessage };
}
