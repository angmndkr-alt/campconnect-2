import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useCampStore } from '@/lib/camp-store';
export type RegisterInput={eventId:string;ticketTypeId?:string;fullName?:string;email?:string;department?:string;year?:string;requiresApproval?:boolean;answers?:Record<string,string>};
export type RegisteredGuest={id:string;status:string;qr_token:string};
export function useRegister(){const q=useQueryClient();const {refreshData}=useCampStore();return useMutation({mutationFn:async(input:RegisterInput)=>{const {eventId,requiresApproval,answers,...body}=input;const res=await api.post<{guest:RegisteredGuest}>('/events/'+eventId+'/registrations',{...body,answers:Object.entries(answers||{}).map(([questionId,answer])=>({questionId,answer}))});await refreshData();await q.invalidateQueries();return res.guest;}});}
