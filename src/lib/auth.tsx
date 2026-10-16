import type { ReactNode } from 'react';
import { useCampStore } from './camp-store';
import { api } from './api-client';
export function AuthProvider({children}:{children:ReactNode}){return <>{children}</>;}
export function useAuth(){const store=useCampStore();return {...store,session:store.profile?{profile:store.profile}:null,changePassword:async(next:string)=>{try{const token=new URLSearchParams(location.search).get('token');if(!token)throw new Error('Open the reset link generated from Forgot password.');await api.post('/auth/reset-password',{token,newPassword:next},{anonymous:true});return {error:null};}catch(e){return {error:e instanceof Error?e.message:'Password reset failed.'};}}};}
