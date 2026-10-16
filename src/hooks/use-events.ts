import { useCampStore } from '@/lib/camp-store';
export type { CampEvent as DbEvent } from '@/lib/types';
export function useEvents(calendarId?:string){const s=useCampStore();return {events:s.events.filter(e=>!calendarId||e.calendar_id===calendarId),isLoading:s.loading,error:s.error,createEvent:s.createEvent,deleteEvent:s.deleteEvent};}
export { useGuests as useEventGuests } from './use-guests';
export { useCheckIn } from './use-check-in';
