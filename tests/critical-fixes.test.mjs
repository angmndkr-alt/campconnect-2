import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:4000/api';
const UNIQUE = Date.now();

let superToken = '';
let clubAToken = '';
let clubBToken = '';
let studentToken = '';
let studentProfile = null;
let eventA = null;
let eventB = null;
let guestPassA = null;

const createdEvents = [];
const createdProfiles = [];

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
    expected: 200,
  });
  superToken = superLogin.data.accessToken;

  async function loginAdmin(email) {
    let res = await api('/auth/admin/login', {
      method: 'POST',
      body: { email, password: 'campus2026' },
    });
    if (res.status === 401) {
      res = await api('/auth/admin/login', {
        method: 'POST',
        body: { email, password: 'campusPassword2026' },
      });
    }
    if (res.data?.profile?.must_change_password) {
      await api('/auth/first-login-password', {
        method: 'POST',
        body: { newPassword: 'campusPassword2026' },
        token: res.data.accessToken,
      });
      res = await api('/auth/admin/login', {
        method: 'POST',
        body: { email, password: 'campusPassword2026' },
      });
    }
    return res.data.accessToken;
  }

  clubAToken = await loginAdmin('admin.cesa@pvppcoe.ac.in');
  clubBToken = await loginAdmin('admin.mesa@pvppcoe.ac.in');

  // 4. Sign up test student
  const studentEmail = `student.audit.${UNIQUE}@pvppcoe.ac.in`;
  const sRes = await api('/auth/signup', {
    method: 'POST',
    body: {
      email: studentEmail,
      password: 'studentPassword123',
      fullName: 'Angel Student',
      department: 'Computer Science',
      yearOrDesignation: 'Year 3',
    },
    expected: 201,
  });
  studentToken = sRes.data.accessToken;
  studentProfile = sRes.data.profile;
  createdProfiles.push(studentProfile.id);

  // 5. Create Event for Club A (CESA)
  const evResA = await api('/events', {
    method: 'POST',
    body: {
      calendarId: 'cesa',
      title: `CESA Hackathon ${UNIQUE}`,
      date: '2026-11-15',
      time: '09:00',
      venue: 'Lab 1',
      maxCapacity: 100,
    },
    token: clubAToken,
    expected: 201,
  });
  eventA = evResA.data.event;
  createdEvents.push(eventA.id);

  // 6. Create Event for Club B (MESA)
  const evResB = await api('/events', {
    method: 'POST',
    body: {
      calendarId: 'mesa',
      title: `MESA Auto Expo ${UNIQUE}`,
      date: '2026-11-16',
      time: '11:00',
      venue: 'Workshop Ground',
      maxCapacity: 100,
    },
    token: clubBToken,
    expected: 201,
  });
  eventB = evResB.data.event;
  createdEvents.push(eventB.id);
});

after(async () => {
  const { query, closePool } = await import('../server/dist/db/pool.js');
  try {
    for (const id of createdEvents) {
      await query('DELETE FROM events WHERE id=$1', [id]);
    }
    for (const id of createdProfiles) {
      await query('DELETE FROM activity_log WHERE user_id=$1', [id]);
      await query('DELETE FROM profiles WHERE id=$1', [id]);
    }
  } finally {
    await closePool();
  }
});

test('BUG 2: Event creation generates exactly 1 pass type, not 5 duplicates', async () => {
  const detail = await api(`/events/${eventA.id}`, { expected: 200 });
  assert.equal(detail.data.ticketTypes.length, 1, 'Event must have exactly 1 ticket pass type');
  assert.equal(detail.data.ticketTypes[0].name, 'Standard');
});

test('BUG 2: Student registration produces exactly 1 valid pass with unique QR token', async () => {
  const regRes = await api(`/events/${eventA.id}/registrations`, {
    method: 'POST',
    body: {
      fullName: 'Angel Student',
      email: studentProfile.email,
    },
    token: studentToken,
    expected: 201,
  });

  guestPassA = regRes.data.guest;
  assert.ok(guestPassA.id, 'Pass must have an ID');
  assert.ok(guestPassA.qr_token, 'Pass must have a QR token');
  assert.equal(guestPassA.status, 'approved');
  assert.equal(guestPassA.full_name, 'Angel Student');

  // Verify on "my-registration"
  const myReg = await api(`/events/${eventA.id}/registrations/me`, {
    token: studentToken,
    expected: 200,
  });
  assert.equal(myReg.data.guest.id, guestPassA.id);
});

test('BUG 2: Repeated registration request is rejected with 409 and creates no duplicate', async () => {
  const dupeRes = await api(`/events/${eventA.id}/registrations`, {
    method: 'POST',
    body: {
      fullName: 'Angel Student',
      email: studentProfile.email,
    },
    token: studentToken,
    expected: 409,
  });
  assert.match(dupeRes.data.error.message, /already registered/i);
});

test('BUG 1: Club A admin sees activity, while Club B admin does NOT', async () => {
  // Club A admin dashboard
  const clubADash = await api('/dashboard', { token: clubAToken, expected: 200 });
  const clubAHasActivity = clubADash.data.activity.some((a) =>
    a.calendar_id === 'cesa' && a.action === 'guest_registered'
  );
  assert.ok(clubAHasActivity, 'Club A admin must see their club event registration in dashboard');

  // Club B admin dashboard MUST NOT see Club A's activity
  const clubBDash = await api('/dashboard', { token: clubBToken, expected: 200 });
  const clubBSeesClubA = clubBDash.data.activity.some((a) => a.calendar_id === 'cesa');
  assert.equal(clubBSeesClubA, false, 'Club B admin must NOT see Club A registration activity');

  // Club B admin cannot query Club A activity explicitly
  const forbiddenQuery = await api('/activity?calendarId=cesa', {
    token: clubBToken,
    expected: 403,
  });
  assert.match(forbiddenQuery.data.error.message, /do not manage this club/i);
});

test('BUG 4: Recent activity displays actual student name instead of "guest_registered"', async () => {
  const clubADash = await api('/dashboard', { token: clubAToken, expected: 200 });
  const regActivity = clubADash.data.activity.find((a) =>
    a.calendar_id === 'cesa' && a.action === 'guest_registered'
  );

  assert.ok(regActivity, 'Registration activity must exist');
  assert.equal(regActivity.actor_name, 'Angel Student');
  assert.match(regActivity.message, /Angel Student registered for/i);
  assert.doesNotMatch(regActivity.message, /^guest_registered/i);
});

test('BUG 1: Platform administrator can see global activity across clubs', async () => {
  const superDash = await api('/dashboard', { token: superToken, expected: 200 });
  const hasAActivity = superDash.data.activity.some((a) => a.calendar_id === 'cesa');
  assert.ok(hasAActivity, 'Super Admin sees activity across all clubs');
});

test('BUG 3: Valid QR pass is validated and checked in for its own event', async () => {
  const checkInRes = await api(`/events/${eventA.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: guestPassA.qr_token, method: 'qr_scan' },
    token: clubAToken,
    expected: 201,
  });

  assert.equal(checkInRes.data.alreadyCheckedIn, false);
  assert.equal(checkInRes.data.guest.id, guestPassA.id);
  assert.equal(checkInRes.data.guest.full_name, 'Angel Student');
  assert.ok(checkInRes.data.guest.checked_in_at);
});

test('BUG 3: Subsequent scan of the same pass is rejected as already used', async () => {
  const secondScan = await api(`/events/${eventA.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: guestPassA.qr_token, method: 'qr_scan' },
    token: clubAToken,
    expected: 200,
  });

  assert.equal(secondScan.data.alreadyCheckedIn, true, 'Subsequent scan must report alreadyCheckedIn=true');
  assert.equal(secondScan.data.guest.id, guestPassA.id);
});

test('BUG 3: Invalid or non-existent QR token is rejected with 404', async () => {
  const invalidRes = await api(`/events/${eventA.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: 'invalid-token-12345', method: 'qr_scan' },
    token: clubAToken,
    expected: 404,
  });
  assert.match(invalidRes.data.error.message, /no ticket matches/i);
});

test('BUG 3: Pass for Event A cannot be used to check in to Event B', async () => {
  const crossEvent = await api(`/events/${eventB.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: guestPassA.qr_token, method: 'qr_scan' },
    token: clubBToken,
    expected: 400,
  });
  assert.match(crossEvent.data.error.message, /different event/i);
});

test('BUG 3: Unauthorized club admin cannot check in passes for another club', async () => {
  const unauthorized = await api(`/events/${eventA.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: guestPassA.qr_token, method: 'qr_scan' },
    token: clubBToken, // Club B admin trying to check in for Event A
    expected: 403,
  });
  assert.match(unauthorized.data.error.message, /do not manage this club/i);
});

test('BUG 3: Check-in is rejected if the event is canceled', async () => {
  // Cancel Event A
  await api(`/events/${eventA.id}`, {
    method: 'PATCH',
    body: { isCanceled: true },
    token: clubAToken,
    expected: 200,
  });

  const canceledScan = await api(`/events/${eventA.id}/check-ins`, {
    method: 'POST',
    body: { qrToken: guestPassA.qr_token, method: 'qr_scan' },
    token: clubAToken,
    expected: 400,
  });
  assert.match(canceledScan.data.error.message, /cancelled/i);
});
