import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEvent, eventInput } from '../src/lib/api-models.ts';
test('detail payload preserves real IDs, questions, prices, owner and calendar',()=>{
 const e=mapEvent({event:{id:'event-id',owner_id:'host-id',calendar_id:'cesa',date:'2026-10-20T00:00:00.000Z',cover_url:'/cover.jpg',is_published:true},calendar:{id:'cesa',name:'CESA & CSI'},ticketTypes:[{id:'ticket-id',name:'General',price_cents:2500}],questions:[{id:'question-uuid',question_text:'Department?',required:false}],stats:{going_count:3}});
 assert.equal(e.date,'2026-10-20');assert.equal(e.image,'/cover.jpg');assert.equal(e.calendar.name,'CESA & CSI');assert.equal(e.ticket_types[0].price,25);assert.equal(e.registration_questions[0].id,'question-uuid');assert.equal(e.registration_questions[0].required,false);
});
test('creation maps UI fields to the actual API contract',()=>{
 const p=eventInput({title:'Workshop',calendar_id:'cesa',date:'2026-10-20',time:'10:00',requires_approval:true,image:'/image.jpg',capacity:12});
 assert.equal(p.calendarId,'cesa');assert.equal(p.requiresApproval,true);assert.equal(p.coverUrl,'/image.jpg');assert.equal(p.maxCapacity,12);
});
