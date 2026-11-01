import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base='http://127.0.0.1:4000/api';const unique=Date.now();const created=[];const profiles=[];
async function request(path,method='GET',body,token,expected=200){const r=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(d)}`);return d;}
let superToken;
try{
 const owner=await request('/auth/admin/login','POST',{email:'admin@pvppcoe.ac.in',password:'campus2026'});superToken=owner.accessToken;
 const email=`repair-admin-${unique}@pvppcoe.ac.in`,studentEmail=`repair-student-${unique}@pvppcoe.ac.in`;
 const {profile:host}=await request('/admin/users','POST',{email,fullName:'Lifecycle Test Host',password:'campus2026',role:'club_admin',calendarIds:['cesa']},superToken,201);profiles.push(host.id);
 const session=await request('/auth/admin/login','POST',{email,password:'campus2026'});let hostToken=session.accessToken;
 assert.equal(session.profile.must_change_password,true);
 await request('/auth/first-login-password','POST',{newPassword:'Lifecycle-test-2026'},hostToken);
 const signed=await request('/auth/admin/login','POST',{email,password:'Lifecycle-test-2026'});hostToken=signed.accessToken;assert.equal(signed.profile.must_change_password,false);
 const refreshed=await request('/auth/refresh','POST',{refreshToken:signed.refreshToken});hostToken=refreshed.accessToken;assert.equal(refreshed.profile.role,'club_admin');
 const student=await request('/auth/signup','POST',{email:studentEmail,password:'Student-test-2026',fullName:'Lifecycle Test Student',department:'CSE',yearOrDesignation:'Year 3'},undefined,201);profiles.push(student.profile.id);const studentToken=student.accessToken;
 const {event}=await request('/events','POST',{calendarId:'cesa',title:`Lifecycle Workshop ${unique}`,date:'2026-11-20',time:'10:00',venue:'Test Lab',requiresApproval:true,maxCapacity:3},hostToken,201);created.push(event.id);
 await request('/events/'+event.id+'/config','POST',{tickets:[{id:'new-ticket',name:'Workshop admission',price:0,ticket_kind:'approval'}],questions:[{id:'new-question',label:'Which workshop?',required:true}]},hostToken);
 const detail=await request('/events/'+event.slug);assert.equal(detail.event.id,event.id);assert.equal(detail.calendar.id,'cesa');const ticket=detail.ticketTypes[0],question=detail.questions[0];
 await request('/events/'+event.id+'/registrations','POST',{fullName:'Lifecycle Test Student',email:studentEmail,ticketTypeId:ticket.id},studentToken,400);
 const {guest}=await request('/events/'+event.id+'/registrations','POST',{fullName:'Lifecycle Test Student',email:studentEmail,ticketTypeId:ticket.id,answers:[{questionId:question.id,answer:'Robotics'}]},studentToken,201);assert.equal(guest.status,'pending_approval');assert.ok(guest.qr_token);
 await request('/events/'+event.id+'/registrations','POST',{fullName:'Lifecycle Test Student',email:studentEmail,answers:[{questionId:question.id,answer:'Robotics'}]},studentToken,409);
 assert.equal((await request('/events/'+event.id+'/registrations/me','GET',undefined,studentToken)).guest.id,guest.id);
 await request('/events/'+event.id+'/registrations/me?email='+studentEmail,'GET',undefined,undefined,401);
 await request('/events/'+event.id+'/check-ins','POST',{qrToken:guest.qr_token},hostToken,400);
 await request('/events/'+event.id+'/guests/'+guest.id+'/status','PATCH',{status:'approved'},hostToken);
 await request('/events/'+event.id,'PATCH',{title:'Edited '+event.title,venue:'Updated Lab'},hostToken);
 await request('/events/'+event.id+'/config','POST',{tickets:[{id:ticket.id,name:'Updated admission',price:0,ticket_kind:'approval'}],questions:[{id:question.id,label:'Which workshop track?',required:true}]},hostToken);
 const edited=await request('/events/'+event.id);assert.equal(edited.ticketTypes[0].id,ticket.id);assert.equal(edited.questions[0].id,question.id);
 await request('/events/'+event.id,'PATCH',{tickets:[{id:ticket.id,name:'Same ticket, renamed',price:0,ticket_kind:'approval'}]},hostToken);assert.equal((await request('/events/'+event.id)).questions[0].id,question.id);
 await request('/events/'+event.id,'PATCH',{questions:[{id:question.id,label:'Still required?',required:true}]},hostToken);assert.equal((await request('/events/'+event.id)).ticketTypes[0].id,ticket.id);
 assert.equal((await request('/events/'+event.id+'/guests','GET',undefined,hostToken)).guests[0].id,guest.id);
 await request('/events/'+event.id,'PATCH',{title:'Unauthorized'},studentToken,403);
 const checkResults=await Promise.all([1,2,3].map(async()=>{const r=await fetch(base+'/events/'+event.id+'/check-ins',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+hostToken},body:JSON.stringify({qrToken:guest.qr_token})});const d=await r.json();assert.ok(r.status===200||r.status===201);return d;}));assert.equal(checkResults.filter(d=>!d.alreadyCheckedIn).length,1);
 assert.equal((await request('/events/'+event.id+'/check-ins','POST',{guestId:guest.id},hostToken)).alreadyCheckedIn,true);
 assert.equal((await request('/student-stats','GET',undefined,studentToken)).stats.attended,1);
 const csv=await fetch(base+'/events/'+event.id+'/guests.csv',{headers:{authorization:'Bearer '+hostToken}});assert.equal(csv.status,200);assert.match(await csv.text(),/Lifecycle Test Student/);
 await request('/events/'+event.id+'/check-ins/'+guest.id,'DELETE',undefined,hostToken);
 await request('/events/'+event.id+'/check-ins','POST',{qrToken:guest.qr_token},hostToken,201);
 await request('/events/'+event.id+'/registrations/'+guest.id,'DELETE',undefined,studentToken);
 assert.equal((await request('/student-stats','GET',undefined,studentToken)).stats.attended,0);
 assert.equal((await request('/events/'+event.id+'/registrations/me','GET',undefined,studentToken)).guest,null);
 await request('/events/'+event.id+'/registrations','POST',{fullName:'Lifecycle Test Student',email:studentEmail,answers:[{questionId:question.id,answer:'Robotics'}]},studentToken,201);
 await request('/auth/me','PATCH',{fullName:'Updated Test Student'},studentToken);assert.equal((await request('/auth/session','GET',undefined,studentToken)).profile.full_name,'Updated Test Student');
 const following=await request('/calendars/cesa/follow','POST',{},studentToken);assert.equal(following.following,true);assert.ok((await request('/calendars/me/follows','GET',undefined,studentToken)).follows.includes('cesa'));
 const channels=(await request('/channels')).channels;const channel=channels.find(c=>c.slug==='general');const sent=await request('/channels/'+channel.id+'/messages','POST',{text:'Lifecycle test message '+unique},studentToken,201);assert.ok((await request('/channels/'+channel.id+'/messages')).messages.some(m=>m.id===sent.message.id));
 const form=new FormData();form.append('file',new Blob([await readFile('public/campconnect/robotics-lab.jpg')],{type:'image/jpeg'}),'test.jpg');const upload=await fetch(base+'/uploads',{method:'POST',headers:{authorization:'Bearer '+studentToken},body:form});assert.equal(upload.status,201);const asset=await upload.json();assert.equal((await fetch('http://127.0.0.1:4000'+asset.url)).status,200);
 const album=await request('/gallery','POST',{title:'Lifecycle album '+unique,date:'2026-10-14',photoUrls:[asset.url],coverUrl:asset.url},studentToken,201);await request('/gallery/'+album.album.id+'/approve','POST',{},hostToken,200);await request('/gallery/'+album.album.id,'PATCH',{title:'Edited lifecycle album'},studentToken);assert.ok((await request('/gallery')).albums.some(a=>a.id===album.album.id&&a.title==='Edited lifecycle album'));await request('/gallery/'+album.album.id,'DELETE',undefined,studentToken);
 const notice=await request('/admin/announcements','POST',{title:'Lifecycle notice '+unique,body:'Test campus announcement',calendarId:'cesa'},hostToken,201);assert.ok((await request('/announcements')).announcements.some(n=>n.id===notice.announcement.id));
 const blast=await request('/admin/events/'+event.id+'/blasts','POST',{subject:'Lifecycle guest update',messageBody:'Test guest update',audience:'all'},hostToken,201);assert.equal((await request('/admin/events/'+event.id+'/blasts','GET',undefined,hostToken)).blasts[0].id,blast.blast.id);assert.ok((await request('/announcements','GET',undefined,studentToken)).announcements.some(n=>n.id===blast.blast.id),'Guest update must appear in the student inbox');
 const {event:sport}=await request('/events','POST',{calendarId:'cesa',title:'Lifecycle Sports '+unique,date:'2026-11-21',time:'10:00',category:'Sports'},hostToken,201);created.push(sport.id);const team=await request('/sports/teams','POST',{eventId:sport.id,name:'Lifecycle Team',players:['Test One','Test Two']},studentToken,201);assert.ok((await request('/sports/teams','GET',undefined,studentToken)).teams.some(t=>t.id===team.team.id));
 const {event:limited}=await request('/events','POST',{calendarId:'cesa',title:'Capacity QA '+unique,date:'2026-11-22',time:'10:00',maxCapacity:1},hostToken,201);created.push(limited.id);
 const concurrent=await Promise.all([1,2,3].map(i=>request('/events/'+limited.id+'/registrations','POST',{fullName:'Capacity Test '+i,email:`capacity-${unique}-${i}@pvppcoe.ac.in`},studentToken,201)));
 assert.equal(concurrent.filter(r=>r.guest.status==='approved').length,1,'Concurrent registration must not overbook the event');
 assert.equal(concurrent.filter(r=>r.guest.status==='waitlist').length,2);
 // Configuration is validated before inserting an event, and nullable edits persist.
 await request('/events','POST',{calendarId:'cesa',title:'Invalid config '+unique,date:'2026-11-23',time:'10:00',tickets:[],questions:[{id:'new',label:'x'.repeat(501),required:true}]},hostToken,400);
 assert.ok(!(await request('/events?range=all')).events.some(e=>e.title==='Invalid config '+unique));
 await request('/events/'+limited.id+'/guests/bulk','POST',{emails:concurrent.filter(r=>r.guest.status==='waitlist').map(r=>r.guest.email),status:'approved'},hostToken,409);
 await request('/events/'+limited.id,'PATCH',{maxCapacity:null},hostToken);
 assert.equal((await request('/events/'+limited.id)).event.max_capacity,null);
 await request('/events/'+limited.id+'/guests/bulk','POST',{emails:concurrent.filter(r=>r.guest.status==='waitlist').map(r=>r.guest.email),status:'approved'},hostToken);
 // Capacity applies across ticket types; paid fallback cannot mint a free pass.
 const {event:tiers}=await request('/events','POST',{calendarId:'cesa',title:'Tier QA '+unique,date:'2026-11-24',time:'10:00',maxCapacity:1,tickets:[{id:'new-a',name:'A',price:0,ticket_kind:'free'},{id:'new-b',name:'B',price:0,ticket_kind:'free'}],questions:[]},hostToken,201);created.push(tiers.id);
 const tierConfig=await request('/events/'+tiers.id);
 const first=await request('/events/'+tiers.id+'/registrations','POST',{fullName:'Tier A',email:'tier-a-'+unique+'@pvppcoe.ac.in',ticketTypeId:tierConfig.ticketTypes[0].id},studentToken,201);assert.equal(first.guest.status,'approved');
 const second=await request('/events/'+tiers.id+'/registrations','POST',{fullName:'Tier B',email:'tier-b-'+unique+'@pvppcoe.ac.in',ticketTypeId:tierConfig.ticketTypes[1].id},studentToken,201);assert.equal(second.guest.status,'waitlist');
 await request('/events/ticket-types/'+tierConfig.ticketTypes[0].id,'PATCH',{paymentType:'paid',priceCents:100},hostToken);
 await request('/events/'+tiers.id+'/registrations','POST',{fullName:'Paid fallback',email:'paid-'+unique+'@pvppcoe.ac.in'},studentToken,400);
 console.log('PASS: real signup, admin setup, sessions, event create/edit, tickets/questions, registration, duplicate prevention, approval, QR check-in/undo, cancellation/rejoin, export, profiles, follows, chat, uploads/albums, notices, guest updates and sports rosters.');
}finally{
 // Only remove records created by this disposable test; never reset the schema or seed data.
 const {query,closePool}=await import('../server/dist/db/pool.js');
 for(const id of created)await query('DELETE FROM events WHERE id=$1',[id]);
 for(const id of profiles){await query('DELETE FROM activity_log WHERE user_id=$1',[id]);await query('DELETE FROM messages WHERE sender_id=$1',[id]);await query('DELETE FROM announcements WHERE sender_id=$1',[id]);await query('DELETE FROM profiles WHERE id=$1',[id]);}
 await closePool();
}
