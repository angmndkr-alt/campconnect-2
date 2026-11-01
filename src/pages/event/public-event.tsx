import { eventDateLabel } from '@/lib/event-display';
import { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import QRCode from 'qrcode';
import {
  CalendarDays, MapPin, Sparkles, Check, Clock, UserRound, ArrowLeft,
  QrCode, Ticket, ShieldCheck, AlertCircle, Share2, CheckCircle2, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useEvent } from '@/hooks/use-event';
import { useRegister } from '@/hooks/use-register';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCampStore } from '@/lib/camp-store';

export default function PublicEventPage() {
  const [, params] = useRoute('/e/:slug');
  const slug = params?.slug || '';
  const { data: event, isLoading, error: eventError } = useEvent(slug);
  const queryClient=useQueryClient();
  const { profile } = useAuth();
  const { events: fallbackEvents, refreshData, auth, loading: authLoading } = useCampStore();

  // Fallback to mock store if database query returns null or offline
  const localFallback = fallbackEvents.find(
    e => (e.slug || e.title.toLowerCase().replace(/\s+/g, '-')) === slug || String(e.id) === slug
  );

  const eventTitle = event?.title || localFallback?.title || 'Event Details';
  const eventClub = event?.calendars?.name || localFallback?.club || 'Campus Club';
  const eventCategory = event?.category || localFallback?.category || 'Tech';
  const eventDate = event?.date || localFallback?.date || '2026-10-20';
  const eventTime = event?.time || localFallback?.time || '10:00 AM';
  const eventVenue = event?.venue || localFallback?.venue || 'Campus Auditorium';
  const eventDescription = event?.description || localFallback?.description || 'Join us for an exciting campus event!';
  const eventCover = event?.cover_url || localFallback?.image || '/campconnect/cultural-night.jpg';
  const eventXp = event?.xp ?? localFallback?.xp ?? 80;
  const requiresApproval = event?.requires_approval ?? false;

  const rawTicketTypes = event?.ticket_types?.length
    ? event.ticket_types
    : [{ id: 't-free', name: 'General Admission Pass', price: 0, ticket_kind: requiresApproval ? 'approval' : 'free' }];

  // Deduplicate tickets by name to prevent multiple identical passes from displaying
  const ticketTypes = rawTicketTypes.filter((t, index, self) =>
    index === self.findIndex((other) => other.name.trim().toLowerCase() === t.name.trim().toLowerCase())
  );

  const questions = event?.registration_questions || [];

  const [selectedTicket, setSelectedTicket] = useState<string>(ticketTypes[0]?.id || '');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [year, setYear] = useState(profile?.year_or_designation || '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  const [registeredGuest, setRegisteredGuest] = useState<{
    id: string;
    status: string;
    qr_token: string;
  } | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  const registerMutation = useRegister();
  const myRegistration=useQuery({queryKey:['my-registration',event?.id,auth?.email],enabled:!!event?.id&&!!auth,queryFn:async()=>{const d=await api.get<any>('/events/'+event!.id+'/registrations/me');return d.guest;}});
  useEffect(()=>{if(event?.ticket_types?.length)setSelectedTicket(event.ticket_types[0].id);},[event?.id,event?.ticket_types?.map(t=>t.id).join(',')]);
  useEffect(()=>{if(profile){setFullName(profile.full_name||'');setEmail(profile.email||'');setDepartment(profile.department||'');setYear(profile.year_or_designation||'');}},[profile?.id]);
  useEffect(()=>{setRegisteredGuest(myRegistration.data||null);},[myRegistration.data]);
  async function cancelRegistration(){try{await api.delete('/events/'+event!.id+'/registrations/'+registeredGuest!.id);setRegisteredGuest(null);await refreshData();await queryClient.invalidateQueries();toast.success('Registration cancelled.');}catch(e){toast.error((e as Error).message);}}


  // Generate QR Code image when registration completes
  useEffect(() => {
    if (registeredGuest?.qr_token) {
      QRCode.toDataURL(registeredGuest.qr_token, { width: 220, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('QR generation error:', err));
    }
  }, [registeredGuest]);

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed.endsWith('@pvppcoe.ac.in') && !emailTrimmed.endsWith('@campus.edu')) {
      toast.error('Please use your college email ending in @pvppcoe.ac.in');
      return;
    }

    const currentTicket = ticketTypes.find(t => t.id === selectedTicket) || ticketTypes[0];
    const isApprovalNeeded = currentTicket?.ticket_kind === 'approval' || requiresApproval;

    registerMutation.mutate(
      {
        eventId: event!.id,
        ticketTypeId: selectedTicket,
        fullName,
        email: emailTrimmed,
        department,
        year,
        requiresApproval: isApprovalNeeded,
        answers,
      },
      {
        onSuccess: (res) => {
          setRegisteredGuest({
            id: res.id,
            status: res.status,
            qr_token: res.qr_token,
          });
          setShowModal(true);
        },
      }
    );
  };

  if(eventError)return <div className="panel mx-auto my-10 max-w-xl"><h1 className="text-xl font-bold">Could not load this event</h1><p className="mt-3 text-muted-foreground">{eventError.message}</p><Link href="/discover" className="primary-link mt-4">Browse events</Link></div>;
  if (isLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="animate-pulse text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading event pass details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top back navigation */}
      <div className="mb-6">
        <Link href="/discover" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Discover events
        </Link>
      </div>

      <div className="event-layout">
        <aside className="event-poster-column"><img className="event-detail-poster" src={eventCover} alt={eventTitle}/><div className="event-host-block"><p className="text-xs text-muted-foreground">Hosted by</p><div className="mt-3 flex items-center gap-3"><span className="calendar-icon"><Building2 size={22}/></span><b>{eventClub}</b></div></div><div className="event-host-block"><span className="tag tone-purple">{eventCategory}</span><p className="mt-3 text-xs text-muted-foreground">Earn {eventXp} XP for taking part.</p></div></aside>
        <div className="event-details-column"><span className="location-label"><Sparkles size={14}/>Campus calendar · {eventClub}</span><h1>{eventTitle}</h1><div className="event-spec"><span className="event-spec-icon"><CalendarDays size={22}/></span><div><b>{eventDateLabel(eventDate)}</b><p>{eventTime}</p></div></div><div className="event-spec"><span className="event-spec-icon"><MapPin size={22}/></span><div><b>{eventVenue}</b><p>On campus</p></div></div><section className="event-registration"><div className="registration-title">Registration</div><div className="registration-body"><p className="text-sm text-muted-foreground">Welcome! Reserve your spot and get your entry pass.</p>
              {!auth ? <div className="mt-4"><p className="text-sm text-muted-foreground">Sign in to register and keep your ticket in your account.</p><Link href={`/login?next=${encodeURIComponent(`/e/${slug}`)}`} className="primary-link mt-4">{authLoading?'Loading your account…':'Sign in to register'}</Link></div> : registeredGuest ? <div className="space-y-3 mt-4"><p className="font-semibold">{registeredGuest.status==='approved'?'You’re registered.':registeredGuest.status==='waitlist'?'You’re on the waitlist.':registeredGuest.status==='declined'?'Your request was declined.':'Awaiting host approval.'}</p><Button onClick={()=>setShowModal(true)} className="w-full">View registration</Button>{auth&&<Button variant="outline" className="w-full" onClick={cancelRegistration}>Cancel registration</Button>}</div> : <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                {/* Ticket Selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Select Ticket Type
                  </label>
                  <div className="space-y-2">
                    {ticketTypes.map((t) => (
                      <label
                        key={t.id}
                        className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                          selectedTicket === t.id
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="ticketType"
                            value={t.id}
                            checked={selectedTicket === t.id || ticketTypes.length === 1}
                            onChange={() => setSelectedTicket(t.id)}
                            className="size-4 accent-primary"
                          />
                          <div>
                            <b className="block text-sm font-semibold">{t.name}</b>
                            <span className="text-xs text-muted-foreground">
                              {t.ticket_kind === 'approval' ? 'Requires organizer approval' : 'Instant confirmation'}
                            </span>
                          </div>
                        </div>
                        <span className="font-display font-bold text-primary">
                          {t.price === 0 ? 'Free' : `\$${t.price}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Attendee Fields */}
                <div className="space-y-3 pt-2">
                  <label className="block text-sm font-semibold">
                    Full Name
                    <Input
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      required
                      className="mt-1 rounded-xl bg-card"
                    />
                  </label>

                  <label className="block text-sm font-semibold">
                    Student Email
                    <Input
                      type="email"
                      placeholder="student@pvppcoe.ac.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="mt-1 rounded-xl bg-card"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm font-semibold">
                      Department
                      <Input
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                        className="mt-1 rounded-xl bg-card"
                      />
                    </label>

                    <label className="block text-sm font-semibold">
                      Year
                      <Input
                        value={year}
                        onChange={e => setYear(e.target.value)}
                        className="mt-1 rounded-xl bg-card"
                      />
                    </label>
                  </div>
                </div>

                {/* Custom Registration Questions */}
                {questions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Organizer Questions
                    </h3>
                    {questions.map(q => (
                      <label key={q.id} className="block text-sm font-semibold">
                        {(q.question || q.label || 'Question')} {(q as { required?: boolean }).required && <span className="text-destructive">*</span>}
                        <Input
                          required={(q as { required?: boolean }).required || false}
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Your answer"
                          className="mt-1 rounded-xl bg-card"
                        />
                      </label>
                    ))}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="mt-4 h-12 w-full rounded-2xl text-base font-bold shadow-lg"
                >
                  {registerMutation.isPending ? (
                    'Registering…'
                  ) : requiresApproval ? (
                    'Request to join'
                  ) : (
                    'Register'
                  )}
                </Button>
              {registerMutation.error&&<p role="alert" className="text-destructive">{registerMutation.error.message}</p>}
              </form>}
        </div></section><section className="event-about"><h2>About this event</h2><p>{eventDescription}</p></section></div>
      </div>

      {/* Ticket Confirmation & QR Code Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="rounded-3xl border-border bg-card p-6 sm:max-w-md">
          <div className="text-center">
            {registeredGuest?.status!=='approved' ? (
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
                <Clock className="size-8" />
              </div>
            ) : (
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="size-8" />
              </div>
            )}

            <DialogTitle className="mt-4 font-display text-2xl font-bold">
              {registeredGuest?.status!=='approved' ? registeredGuest?.status==='declined'?'Registration declined':registeredGuest?.status==='waitlist'?'On the waitlist':'Request submitted' : 'You’re Registered!'}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-muted-foreground">
              {registeredGuest?.status!=='approved'
                ? registeredGuest?.status==='declined'?'The host declined this registration. Contact your club with any questions.':registeredGuest?.status==='waitlist'?'You are on the waitlist. Your ticket becomes valid when approved.':'Your registration is awaiting host approval. Return to this page to check its status.'
                : 'Your ticket and QR entry pass have been generated below.'}
            </DialogDescription>
          </div>

          {/* QR Code Pass Card */}
          {qrDataUrl && registeredGuest?.status === 'approved' && (
            <div className="mt-6 pass-card text-center p-6 rounded-2xl border border-primary/20">
              <p className="eyebrow text-xs uppercase tracking-widest text-primary font-bold">Official Campus Ticket</p>
              <h3 className="font-display text-xl font-bold mt-1">{eventTitle}</h3>
              <p className="text-xs text-muted-foreground">{eventDateLabel(eventDate)} · {eventVenue}</p>

              <div className="my-5 flex justify-center">
                <div className="rounded-2xl border-4 border-background bg-white p-3 shadow-md">
                  <img src={qrDataUrl} alt="QR Code Ticket" className="size-44" />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
                <QrCode className="size-4 text-primary" />
                <span>Token: {registeredGuest?.qr_token}</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setShowModal(false)} className="w-full rounded-xl">
              Done & View My Pass
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
