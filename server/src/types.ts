export type AppRole = 'student' | 'club_admin' | 'checkin_staff' | 'super_admin';
export type CalendarAdminRole = 'owner' | 'admin' | 'manager' | 'checkin_staff';
export type ApprovalStatus = 'invited' | 'pending_approval' | 'approved' | 'waitlist' | 'declined';
export type EventVisibility = 'public' | 'private' | 'member_only';
export type EventKind = 'in_person' | 'online' | 'hybrid';
export type PaymentType = 'free' | 'paid';
export type QuestionType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'terms';
export type BlastAudience = 'all' | 'attendees' | 'waitlist' | 'not_going';
export type CheckinMethod = 'qr_scan' | 'manual' | 'self';

export const APP_ROLES: AppRole[] = ['student', 'club_admin', 'checkin_staff', 'super_admin'];
export const CALENDAR_ADMIN_ROLES: CalendarAdminRole[] = [
  'owner',
  'admin',
  'manager',
  'checkin_staff',
];
export const APPROVAL_STATUSES: ApprovalStatus[] = [
  'invited',
  'pending_approval',
  'approved',
  'waitlist',
  'declined',
];

/** Fields of profiles that are ever safe to send to a client. */
export const PUBLIC_PROFILE_COLUMNS = `
  id, email, full_name, avatar_url, department, year_or_designation,
  role, must_change_password, created_at, updated_at
`;

export const PUBLIC_GUEST_COLUMNS = `
  id, event_id, ticket_type_id, profile_id, full_name, email, phone, department,
  year, status, qr_token, note, checked_in_at, is_invalidated, registered_at, updated_at
`;

export const PUBLIC_EVENT_COLUMNS = `
  id, calendar_id, owner_id, title, slug, category, description, event_type,
  visibility, date, end_date, time, end_time, timezone, venue, online_url, xp,
  tone, cover_url, max_capacity, requires_approval, waitlist_enabled,
  is_published, is_canceled, created_at, updated_at
`;