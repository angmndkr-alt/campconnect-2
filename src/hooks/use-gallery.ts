import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PhotoAlbum } from '@/lib/types';

export function useGallery() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      const data = await api.get<PhotoAlbum[]>('/gallery/albums');
      return data;
    },
  });

  const uploadAlbum = useMutation({
    mutationFn: async (album: { title: string; event_id?: string; date: string; description: string; club: string; posted_by: string; cover: string; photos: string[] }) => {
      const data = await api.post<PhotoAlbum>('/gallery/albums', album);
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      return data;
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: async (id: number) => {
      await api.delete('/gallery/albums/' + id);
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
    },
  });

  return { ...query, uploadAlbum, deleteAlbum };
}
