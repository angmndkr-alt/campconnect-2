export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'student' | 'club_admin' | 'checkin_staff' | 'super_admin';
export type RegistrationStatus = 'approved' | 'pending' | 'declined' | 'waitlist' | 'checked_in';
export type TicketTypeKind = 'free' | 'approval';
export type BlastAudience = 'all' | 'attendees' | 'waitlist';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          avatar_url: string | null
          department: string | null
          year_or_designation: string | null
          role: AppRole
          must_change_password: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          avatar_url?: string | null
          department?: string | null
          year_or_designation?: string | null
          role?: AppRole
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          avatar_url?: string | null
          department?: string | null
          year_or_designation?: string | null
          role?: AppRole
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      calendars: {
        Row: {
          id: string
          slug: string
          name: string
          icon: string
          tone: string
          blurb: string | null
          members_count: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          icon?: string
          tone?: string
          blurb?: string | null
          members_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          icon?: string
          tone?: string
          blurb?: string | null
          members_count?: number
          created_at?: string
        }
      }
      calendar_admins: {
        Row: {
          calendar_id: string
          profile_id: string
          role: string
          created_at: string
        }
        Insert: {
          calendar_id: string
          profile_id: string
          role?: string
          created_at?: string
        }
        Update: {
          calendar_id?: string
          profile_id?: string
          role?: string
          created_at?: string
        }
      }
      events: {
        Row: {
          id: string
          calendar_id: string
          title: string
          slug: string
          category: string
          description: string | null
          date: string
          time: string
          venue: string
          xp: number
          tone: string
          cover_url: string | null
          max_capacity: number | null
          requires_approval: boolean
          owner_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          calendar_id: string
          title: string
          slug: string
          category?: string
          description?: string | null
          date: string
          time: string
          venue: string
          xp?: number
          tone?: string
          cover_url?: string | null
          max_capacity?: number | null
          requires_approval?: boolean
          owner_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          calendar_id?: string
          title?: string
          slug?: string
          category?: string
          description?: string | null
          date?: string
          time?: string
          venue?: string
          xp?: number
          tone?: string
          cover_url?: string | null
          max_capacity?: number | null
          requires_approval?: boolean
          owner_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      event_hosts: {
        Row: {
          id: string
          event_id: string
          name: string
          role: string | null
          avatar_url: string | null
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          role?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          role?: string | null
          avatar_url?: string | null
        }
      }
      ticket_types: {
        Row: {
          id: string
          event_id: string
          name: string
          price: number
          capacity: number | null
          ticket_kind: TicketTypeKind
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          price?: number
          capacity?: number | null
          ticket_kind?: TicketTypeKind
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          price?: number
          capacity?: number | null
          ticket_kind?: TicketTypeKind
          created_at?: string
        }
      }
      registration_questions: {
        Row: {
          id: string
          event_id: string
          question_text: string
          question_type: string
          required: boolean
          options: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          question_text: string
          question_type?: string
          required?: boolean
          options?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          question_text?: string
          question_type?: string
          required?: boolean
          options?: Json | null
          created_at?: string
        }
      }
      guests: {
        Row: {
          id: string
          event_id: string
          ticket_type_id: string | null
          profile_id: string | null
          full_name: string
          email: string
          department: string | null
          year: string | null
          status: RegistrationStatus
          qr_token: string
          checked_in_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          ticket_type_id?: string | null
          profile_id?: string | null
          full_name: string
          email: string
          department?: string | null
          year?: string | null
          status?: RegistrationStatus
          qr_token?: string
          checked_in_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          ticket_type_id?: string | null
          profile_id?: string | null
          full_name?: string
          email?: string
          department?: string | null
          year?: string | null
          status?: RegistrationStatus
          qr_token?: string
          checked_in_at?: string | null
          created_at?: string
        }
      }
      registration_answers: {
        Row: {
          id: string
          guest_id: string
          question_id: string
          answer_text: string
        }
        Insert: {
          id?: string
          guest_id: string
          question_id: string
          answer_text: string
        }
        Update: {
          id?: string
          guest_id?: string
          question_id?: string
          answer_text?: string
        }
      }
      check_ins: {
        Row: {
          id: string
          guest_id: string
          checked_in_by: string | null
          checked_in_at: string
          method: string
        }
        Insert: {
          id?: string
          guest_id: string
          checked_in_by?: string | null
          checked_in_at?: string
          method?: string
        }
        Update: {
          id?: string
          guest_id?: string
          checked_in_by?: string | null
          checked_in_at?: string
          method?: string
        }
      }
      blasts: {
        Row: {
          id: string
          event_id: string | null
          calendar_id: string | null
          sender_id: string | null
          subject: string
          message_body: string
          audience: BlastAudience
          sent_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          calendar_id?: string | null
          sender_id?: string | null
          subject: string
          message_body: string
          audience?: BlastAudience
          sent_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          calendar_id?: string | null
          sender_id?: string | null
          subject?: string
          message_body?: string
          audience?: BlastAudience
          sent_at?: string
        }
      }
      announcements: {
        Row: {
          id: string
          title: string
          body: string
          tone: string
          audience: string | null
          calendar_id: string | null
          sender_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          body: string
          tone?: string
          audience?: string | null
          calendar_id?: string | null
          sender_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          body?: string
          tone?: string
          audience?: string | null
          calendar_id?: string | null
          sender_id?: string | null
          created_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          slug: string
          name: string
          calendar_id: string | null
        }
        Insert: {
          id?: string
          slug: string
          name: string
          calendar_id?: string | null
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          calendar_id?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          sender_id: string | null
          sender_name: string
          sender_initials: string
          sender_tone: string
          is_admin: boolean
          club_name: string | null
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          sender_id?: string | null
          sender_name: string
          sender_initials?: string
          sender_tone?: string
          is_admin?: boolean
          club_name?: string | null
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          sender_id?: string | null
          sender_name?: string
          sender_initials?: string
          sender_tone?: string
          is_admin?: boolean
          club_name?: string | null
          text?: string
          created_at?: string
        }
      }
      albums: {
        Row: {
          id: string
          calendar_id: string | null
          title: string
          event_name: string | null
          date: string
          description: string | null
          posted_by: string
          owner_id: string | null
          cover_url: string
          created_at: string
        }
        Insert: {
          id?: string
          calendar_id?: string | null
          title: string
          event_name?: string | null
          date?: string
          description?: string | null
          posted_by: string
          owner_id?: string | null
          cover_url: string
          created_at?: string
        }
        Update: {
          id?: string
          calendar_id?: string | null
          title?: string
          event_name?: string | null
          date?: string
          description?: string | null
          posted_by?: string
          owner_id?: string | null
          cover_url?: string
          created_at?: string
        }
      }
      album_photos: {
        Row: {
          id: string
          album_id: string
          photo_url: string
          created_at: string
        }
        Insert: {
          id?: string
          album_id: string
          photo_url: string
          created_at?: string
        }
        Update: {
          id?: string
          album_id?: string
          photo_url?: string
          created_at?: string
        }
      }
      follows: {
        Row: {
          profile_id: string
          calendar_id: string
          created_at: string
        }
        Insert: {
          profile_id: string
          calendar_id: string
          created_at?: string
        }
        Update: {
          profile_id?: string
          calendar_id?: string
          created_at?: string
        }
      }
      activity_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          details: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          details?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          details?: string | null
          created_at?: string
        }
      }
    }
  }
}
