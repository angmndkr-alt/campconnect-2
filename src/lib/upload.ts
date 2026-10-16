import { API_URL, tokens } from './api-client';
export async function uploadImage(file:File):Promise<string>{
 if(!file.type.startsWith('image/'))throw new Error('Choose an image file.');
 if(file.size>8*1024*1024)throw new Error('Choose an image smaller than 8 MB.');
 const form=new FormData();form.append('file',file);
 const response=await fetch(API_URL+'/uploads',{method:'POST',headers:{authorization:'Bearer '+tokens.access},body:form});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Image upload failed.');return data.url;
}
