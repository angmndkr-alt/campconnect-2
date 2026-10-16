/** Hypermedia payload shapes returned by the CampConnect API */

export type Role = 'student' | 'admin';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  calendar_id: string | null;
  club_name: string | null;
  must_change_password: boolean;
  first_login: boolean;
  club: string | null;
  firstLogin: boolean;
  avatar?: string | null;
  department: string;
  designation?: string;
  staff_role?: 'event_staff' | 'org_admin' | 'checkin_staff';
  verified: boolean;
};

export type StudentProfile = {
  id: string;
  email: string;
  name: string;
  role: 'student';
  student_code: string;
  department: string;
  year: string;
  club_id: string | null;
  club_name: string | null;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  profile: User | StudentProfile;
  tokenType: string;
  expiresIn: number;
};

/** Matches the DB `events` row + the client EventItem. */
export type CampEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  organizer: string;
  hosting: string;
  links: string;
  goals: string;
  requirements: string;
  ticket_type: string;
  status: 'active' | 'published' | 'draft' | 'cancelled';
  cover_url: string | null;
  thumbnail_url: string | null;
  attendee_count: number;
  capacity: number | null;
  color: string | null;
  tone: string;
  image: string;
  slug: string | null;
  registered_count: number;
  stats: Record<string, number> | null;
  calendar_id: string;
  calendar?: { id: string; name: string; tone: string; description: string; cover_url: string | null };
  calendars?: { id: string; name: string } | null;
  guests?: GuestRow[];
  xp?: number;
  requires_approval?: boolean;
  ticket_types?: Array<{ id: string; name: string; price: number; ticket_kind: string }>;
  registration_questions?: Array<{ id: string | number; label?: string; question?: string; required?:boolean }>;
  event_hosts?: Array<{ name?: string } | string>;
  max_capacity?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  year: string;
  status: 'approved' | 'pending_approval' | 'pending' | 'waitlisted' | 'waitlist' | 'invited' | 'declined' | 'checked_in';
  ticket_types_name: string | null;
  ticket_type_id: string | null;
  ticket_price: number | null;
  qr_token: string | null;
  checked_in_at: string | null;
  registered_at: string;
  event_id: string;
};

export type PhotoAlbum = {
  id: number;
  title: string;
  event_id?: string;
  event?: string;
  date: string;
  description: string;
  club: string | null;
  posted_by: string;
  owner?: string | null;
  cover: string;
  photos: string[];
};

export type CommunityMessage = {
  id: number;
  channel: string;
  name: string;
  initials: string;
  time: string;
  text: string;
  tone: string;
  admin: boolean;
  club?: string;
};

export type Notice = {
  id: number;
  title: string;
  body: string;
  time: string;
  tone: string;
  unread: boolean;
  audience?: string;
  club?: string;
  sender?: string;
  owner?: string;
};

export type Club = {
  id: string;
  name: string;
  description: string;
  tone: string;
  cover_url: string | null;
  member_count: number;
  created_at: string;
  admins: User[];
};

export type ActivityItem = {
  id: number;
  action: string;
  created_at: string;
};

export type Appointment = {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  club_id: string | null;
  club?: string;
};
