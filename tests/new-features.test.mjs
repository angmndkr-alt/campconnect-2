import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:4000/api';
const UNIQUE = Date.now();

let superToken = '';
let clubAdminToken = '';
let studentToken = '';
let studentId = '';

async function api(path, { method = 'GET', body, token, expected } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (expected !== undefined) {
    assert.equal(
      res.status,
      expected,
      `${method} ${path} returned status ${res.status} (expected ${expected}): ${JSON.stringify(data)}`
    );
  }
  return { status: res.status, data };
}

before(async () => {
  // 1. Login super admin
  const superLogin = await api('/auth/admin/login', {
    method: 'POST',
    body: { email: 'admin@pvppcoe.ac.in', password: 'campus2026' },
  });
  superToken = superLogin.data.accessToken;

  // 2. Login club admin (CESA)
  let adminRes = await api('/auth/admin/login', {
    method: 'POST',
    body: { email: 'admin.cesa@pvppcoe.ac.in', password: 'campus2026' },
  });
  if (adminRes.status === 401) {
    adminRes = await api('/auth/admin/login', {
      method: 'POST',
      body: { email: 'admin.cesa@pvppcoe.ac.in', password: 'campusPassword2026' },
    });
  }
  clubAdminToken = adminRes.data.accessToken;

  // 3. Create a unique student
  const email = `test.student.${UNIQUE}@pvppcoe.ac.in`;
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: {
      email,
      password: 'studentPassword123',
      fullName: 'Test Student Department',
    },
    expected: 201,
  });
  studentToken = signup.data.accessToken;
  studentId = signup.data.profile.id;
});

test('FEATURE 1: Student can select and update department, persisting to database', async () => {
  // Update profile with department
  const updateRes = await api('/auth/me', {
    method: 'PATCH',
    token: studentToken,
    body: {
      fullName: 'Test Student Department',
      department: 'Information Technology',
    },
    expected: 200,
  });

  assert.equal(updateRes.data.profile.department, 'Information Technology');

  // Verify retrieval via session endpoint
  const sessionRes = await api('/auth/session', {
    token: studentToken,
    expected: 200,
  });

  assert.equal(sessionRes.data.profile.department, 'Information Technology');
});

test('FEATURE 2: Student photo uploads go to pending status and are hidden from public gallery', async () => {
  // Student uploads an album/photo
  const uploadRes = await api('/gallery', {
    method: 'POST',
    token: studentToken,
    body: {
      title: `Campus Snap ${UNIQUE}`,
      date: '2026-11-01',
      description: 'Submitted by student for review',
      photoUrls: ['/campconnect/cultural-night.jpg'],
    },
    expected: 201,
  });

  const albumId = uploadRes.data.album.id;
  assert.equal(uploadRes.data.album.status, 'pending');

  // Verify it does NOT appear in public gallery
  const publicGallery = await api('/gallery', { expected: 200 });
  const inPublic = publicGallery.data.albums.some((a) => a.id === albumId);
  assert.equal(inPublic, false, 'Pending photo must NOT appear in public gallery');

  // Regular student cannot approve their own or other photos (403 Forbidden)
  const studentApprove = await api(`/gallery/${albumId}/approve`, {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(studentApprove.status, 403, 'Students must NOT have permission to approve photos');

  // Admin can view pending photo in pending list
  const pendingRes = await api('/gallery/pending', {
    token: clubAdminToken,
    expected: 200,
  });
  const inPending = pendingRes.data.albums.find((a) => a.id === albumId);
  assert.ok(inPending, 'Admin must see submitted photo in pending list');
  assert.equal(inPending.uploader_name, 'Test Student Department');

  // Admin approves photo
  await api(`/gallery/${albumId}/approve`, {
    method: 'POST',
    token: clubAdminToken,
    expected: 200,
  });

  // Now the photo is visible in the public gallery!
  const publicAfterApprove = await api('/gallery', { expected: 200 });
  const visible = publicAfterApprove.data.albums.some((a) => a.id === albumId);
  assert.equal(visible, true, 'Approved photo must now be visible in public gallery');
});

test('FEATURE 3: Specific photograph by Angel Mandaokar is removed', async () => {
  const publicGallery = await api('/gallery', { expected: 200 });
  const angelPhoto = publicGallery.data.albums.find(
    (a) =>
      a.title === 'Your campus moment' &&
      a.posted_by?.toLowerCase().includes('angel mandaokar')
  );
  assert.equal(angelPhoto, undefined, 'Angel Mandaokar image must not exist in gallery');
});

test('FEATURE 4: Student attendance endpoint distinguishes registered vs attended events', async () => {
  // Create an event as club admin
  const eventRes = await api('/events', {
    method: 'POST',
    token: clubAdminToken,
    body: {
      calendarId: 'cesa',
      title: `Attendance Test Event ${UNIQUE}`,
      date: '2026-11-05',
      time: '14:00',
      venue: 'Main Seminar Hall',
      category: 'Tech',
      maxCapacity: 50,
    },
    expected: 201,
  });
  const eventId = eventRes.data.event.id;

  // Student registers for event
  const regRes = await api(`/events/${eventId}/registrations`, {
    method: 'POST',
    token: studentToken,
    body: {
      fullName: 'Test Student Department',
      email: `test.student.${UNIQUE}@pvppcoe.ac.in`,
    },
    expected: 201,
  });
  const guest = regRes.data.guest;

  // Before check-in: registration alone must NOT count as attended
  const statsBefore = await api('/student-stats', {
    token: studentToken,
    expected: 200,
  });
  assert.equal(
    statsBefore.data.attendedEventIds.includes(eventId),
    false,
    'Registered event must NOT be in attendedEventIds prior to check-in'
  );

  // Check in the student using their QR token
  await api(`/events/${eventId}/check-ins`, {
    method: 'POST',
    token: clubAdminToken,
    body: { qrToken: guest.qr_token },
    expected: 201,
  });

  // After check-in: event is classified as attended!
  const statsAfter = await api('/student-stats', {
    token: studentToken,
    expected: 200,
  });
  assert.equal(
    statsAfter.data.attendedEventIds.includes(eventId),
    true,
    'Checked-in event MUST be in attendedEventIds'
  );
});
