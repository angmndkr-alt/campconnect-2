import { toast } from 'sonner';
import { useState, useRef, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  Users, CheckCircle, Clock, XCircle, Search, Download, Camera,
  Send, BarChart2, Ticket, Sparkles, Filter, Plus, ShieldCheck, QrCode, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useGuests, type GuestRow } from '@/hooks/use-guests';
import { useCheckIn } from '@/hooks/use-check-in';
import { useBlasts } from '@/hooks/use-blasts';
import { useEvent } from '@/hooks/use-event';

export default function ManageDashboard() {
  const [, params] = useRoute('/manage/:id');
  const eventId = params?.id || 'e1000000-0000-0000-0000-000000000001';

  const { data: event, error: eventError } = useEvent(eventId);
  const { guests, updateGuestStatus, bulkUpdateStatus, exportCsv, undoCheckIn } = useGuests(eventId);
  const { verifyAndCheckInToken, scanResult, clearScanResult } = useCheckIn(eventId);
  const { sendBlast, data: blastHistory } = useBlasts(eventId);

  const [activeTab, setActiveTab] = useState<'overview' | 'guests' | 'checkin' | 'blasts' | 'tickets'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [manualToken, setManualToken] = useState('');

  // Blast form state
  const [blastSubject, setBlastSubject] = useState('');
  const [blastBody, setBlastBody] = useState('');
  const [blastAudience, setBlastAudience] = useState<'all' | 'attendees' | 'waitlist'>('all');

  // QR Scanner video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    if (isCameraActive && videoRef.current) {
      const codeReader = new BrowserMultiFormatReader();
      codeReader
        .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) {
            const token = result.getText();
            verifyAndCheckInToken.mutate({ tokenOrId: token });
          }
        })
        .then((c) => {
          if (cancelled) {
            c.stop();
          } else {
            controls = c;
          }
        })
        .catch(()=>{setIsCameraActive(false);toast.error('Camera could not start. Allow camera access or verify a QR token manually.');});
    }

    return () => {
      cancelled = true;
      if (controls) {
        controls.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive]);

  const eventTitle = event?.title || 'Midnight Mosaic';
  const maxCapacity = event?.max_capacity || 0;

  // Filtered guest list
  const filteredGuests = guests.filter(g => {
    const matchesSearch =
      g.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (g.qr_token || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'checked_in' ? !!g.checked_in_at : g.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const totalGuests = guests.length;
  const approvedCount = guests.filter(g => g.status === 'approved' || g.status === 'checked_in').length;
  const pendingCount = guests.filter(g => g.status === 'pending_approval').length;
  const checkedInCount = guests.filter(g => !!g.checked_in_at).length;

  const toggleSelectGuest = (id: string) => {
    setSelectedGuestIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedGuestIds.length === filteredGuests.length) {
      setSelectedGuestIds([]);
    } else {
      setSelectedGuestIds(filteredGuests.map(g => g.id));
    }
  };

  const handleManualCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    verifyAndCheckInToken.mutate({ tokenOrId: manualToken.trim() },{onSuccess:()=>setManualToken('')});
  };

  const handleSendBlast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blastSubject || !blastBody) return;
    try { await sendBlast.mutateAsync({
      title: blastSubject,
      body: blastBody,
      audience: blastAudience,
      channel: 'email',
      eventId,
      subject: blastSubject,
      messageBody: blastBody,
    });
    setBlastSubject('');
    setBlastBody('');
    toast.success('Announcement saved for guests.'); } catch(e){toast.error((e as Error).message);}
  };

  if(eventError)return <div className="panel">{eventError.message}</div>;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{(updateGuestStatus.error||bulkUpdateStatus.error||sendBlast.error)&&<p role="alert" className="mb-4 text-destructive">{(updateGuestStatus.error||bulkUpdateStatus.error||sendBlast.error)?.message}</p>}
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/events" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Back to Club Console
          </Link>
          <h1 className="font-display text-3xl font-bold">{eventTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Guests, tickets and attendance</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportCsv(guests, eventTitle)} variant="outline" className="rounded-xl">
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
          <Link href={`/e/${event?.slug || eventId}`}>
            <Button className="rounded-xl">View Public Event</Button>
          </Link>
        </div>
      </div>

      {/* Console Tab Navigation */}
      <div className="mb-8 flex gap-2 border-b border-border overflow-x-auto pb-2">
        {[
          ['overview', 'Overview', BarChart2],
          ['guests', `Guests (${totalGuests})`, Users],
          ['checkin', 'Check-In Scanner', QrCode],
          ['blasts', 'Guest updates', Send],
          ['tickets', 'Ticket Tiers', Ticket],
        ].map(([id, label, Icon]: any) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & INSIGHTS */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Users className="size-6" />
              </div>
              <div>
                <small className="text-xs text-muted-foreground font-semibold">Total Registrations</small>
                <b className="block font-display text-2xl">{totalGuests}{maxCapacity?' / '+maxCapacity:' · Unlimited capacity'}</b>
              </div>
            </div>

            <div className="panel flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <CheckCircle className="size-6" />
              </div>
              <div>
                <small className="text-xs text-muted-foreground font-semibold">Approved Passes</small>
                <b className="block font-display text-2xl">{approvedCount}</b>
              </div>
            </div>

            <div className="panel flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
                <Clock className="size-6" />
              </div>
              <div>
                <small className="text-xs text-muted-foreground font-semibold">Pending Approval</small>
                <b className="block font-display text-2xl">{pendingCount}</b>
              </div>
            </div>

            <div className="panel flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-purple-500/10 text-purple-500">
                <QrCode className="size-6" />
              </div>
              <div>
                <small className="text-xs text-muted-foreground font-semibold">Checked In</small>
                <b className="block font-display text-2xl">{checkedInCount}</b>
              </div>
            </div>
          </div>

          {/* Meter Progress Bar */}
          {maxCapacity>0&&<div className="panel">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Event Capacity Meter</span>
              <span className="text-muted-foreground">{Math.round((approvedCount / maxCapacity) * 100)}% Occupied</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, (approvedCount / maxCapacity) * 100)}%` }}
              />
            </div>
          </div>}
        </div>
      )}

      {/* TAB 2: GUEST LIST & APPROVALS */}
      {activeTab === 'guests' && (
        <div className="space-y-6">
          {/* Filter & Action Toolbar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search guests" placeholder="Search guests by name, email, or token…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-xl bg-card"
                />
              </div>

              <select
                aria-label="Filter guests by status" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="filter rounded-xl"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending_approval">Pending</option>
                <option value="checked_in">Checked In</option>
                <option value="declined">Declined</option>
              </select>
            </div>

            {selectedGuestIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => bulkUpdateStatus.mutate({ guestIds: selectedGuestIds, status: 'approved' })}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Bulk Approve ({selectedGuestIds.length})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => bulkUpdateStatus.mutate({ guestIds: selectedGuestIds, status: 'declined' })}
                  className="rounded-xl"
                >
                  Bulk Decline
                </Button>
              </div>
            )}
          </div>

          {/* Guest Data Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedGuestIds.length === filteredGuests.length && filteredGuests.length > 0}
                        onChange={selectAll}
                        className="size-4 rounded accent-primary"
                      />
                    </th>
                    <th className="p-4">Attendee Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Dept / Year</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">QR Pass Token</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredGuests.length > 0 ? (
                    filteredGuests.map(g => (
                      <tr key={g.id} className="hover:bg-muted/30">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedGuestIds.includes(g.id)}
                            onChange={() => toggleSelectGuest(g.id)}
                            className="size-4 rounded accent-primary"
                          />
                        </td>
                        <td className="p-4 font-semibold">{g.full_name}</td>
                        <td className="p-4 text-muted-foreground">{g.email}</td>
                        <td className="p-4 text-muted-foreground">{g.department} · {g.year}</td>
                        <td className="p-4">
                          <span
                            className={`tag ${
                              g.status === 'approved'
                                ? 'tone-mint'
                                : g.status === 'checked_in'
                                ? 'tone-purple'
                                : g.status === 'pending_approval'
                                ? 'tone-amber'
                                : 'tone-coral'
                            }`}
                          >
                            {g.checked_in_at?'Checked in':g.status.replaceAll('_',' ')}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">{g.qr_token || "—"}</td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            {g.checked_in_at&&<Button size="sm" variant="secondary" onClick={()=>undoCheckIn.mutate(g.id)}>Undo check-in</Button>}
                            {g.status === 'pending_approval' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => updateGuestStatus.mutate({ guestId: g.id, status: 'approved' })}
                                  className="h-8 rounded-lg text-xs"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updateGuestStatus.mutate({ guestId: g.id, status: 'declined' })}
                                  className="h-8 rounded-lg text-xs text-destructive"
                                >
                                  Decline
                                </Button>
                              </>
                            )}
                            {g.status === 'approved' && !g.checked_in_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => verifyAndCheckInToken.mutate({ tokenOrId: g.id })}
                                className="h-8 rounded-lg text-xs"
                              >
                                Check In
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No registrations match your search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CHECK-IN SCANNER */}
      {activeTab === 'checkin' && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="panel text-center">
            <QrCode className="mx-auto size-12 text-primary" />
            <h2 className="mt-3 font-display text-2xl font-bold">QR Attendance Scanner</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan student pass QR codes via device camera or search manually.
            </p>

            {/* Camera Toggle */}
            <div className="mt-6">
              <Button
                onClick={() => setIsCameraActive(v => !v)}
                className="rounded-2xl shadow-md"
              >
                <Camera className="mr-2 size-4" />
                {isCameraActive ? 'Stop Camera Scanner' : 'Start Live Camera Scanner'}
              </Button>
            </div>

            {/* Video Viewport */}
            {isCameraActive && (
              <div className="mt-6 mx-auto overflow-hidden rounded-2xl border-2 border-primary bg-black max-w-sm">
                <video ref={videoRef} className="h-64 w-full object-cover" />
              </div>
            )}

            {/* Manual Code Search */}
            <form onSubmit={handleManualCheckIn} className="mt-8 flex gap-2">
              <Input
                aria-label="QR token or guest ID" placeholder="Enter guest QR Token or ID manually…"
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                className="h-12 rounded-xl bg-card"
              />
              <Button type="submit" className="h-12 px-6 rounded-xl">Verify & Check In</Button>
            </form>
          </div>

          {/* Verification Result Banner */}
          {scanResult && (
            <div
              className={`rounded-2xl border p-5 shadow-lg ${
                scanResult.success
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <b className="font-display text-lg">{scanResult.success ? 'Success!' : 'Verification Failed'}</b>
                  <p className="mt-1 text-sm">{scanResult.message}</p>

                  {scanResult.guest && (
                    <div className="mt-3 text-xs opacity-90">
                      Guest: <b>{scanResult.guest.full_name}</b> ({scanResult.guest.email})
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={clearScanResult}>Dismiss</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BLASTS & EMAIL */}
      {activeTab === 'blasts' && (
        <div className="mx-auto max-w-2xl panel">
          <h2 className="font-display text-2xl font-bold">Guest announcement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send an instant notification or announcement to your registered attendees.
          </p>

          <form onSubmit={handleSendBlast} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold">Audience Scope</label>
              <select
                value={blastAudience}
                onChange={e => setBlastAudience(e.target.value as any)}
                className="filter w-full mt-1 rounded-xl"
              >
                <option value="all">All Registered Guests & Applicants</option>
                <option value="attendees">Approved & Checked-In Guests Only</option>
                <option value="waitlist">Waitlisted guests only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold">Subject Line</label>
              <Input
                required
                value={blastSubject}
                onChange={e => setBlastSubject(e.target.value)}
                placeholder="e.g. Venue Change Notice for Midnight Mosaic"
                className="mt-1 h-12 rounded-xl bg-card"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">Message Body</label>
              <Textarea
                required
                rows={5}
                value={blastBody}
                onChange={e => setBlastBody(e.target.value)}
                placeholder="Write your event announcement here…"
                className="mt-1 rounded-xl bg-card"
              />
            </div>

            <Button disabled={sendBlast.isPending} type="submit" className="h-12 w-full rounded-2xl font-bold">
              <Send className="mr-2 size-4" /> Publish update
            </Button>
          </form><p className="mt-3 text-xs text-muted-foreground">Updates appear in registered students’ notification feeds. Email delivery is not configured.</p><div className="mt-8 space-y-4">{blastHistory?.map((b:any)=><article key={b.id} className="stat"><b>{b.subject}</b><p className="mt-2 text-sm text-muted-foreground">{b.message_body}</p><small>{b.recipient_count} recipients</small></article>)}</div>
        </div>
      )}

      {/* TAB 5: TICKET TIERS */}
      {activeTab === 'tickets' && (
        <div className="panel space-y-4">
          <h2 className="font-display text-2xl font-bold">Ticket Tiers Configuration</h2>
          <p className="text-sm text-muted-foreground">Configure ticket availability and approval rules.</p>
          
          <div className="grid gap-4 sm:grid-cols-2">{event?.ticket_types?.map(t=><div key={t.id} className="panel"><b>{t.name}</b><p className="mt-2 text-sm text-muted-foreground">{t.ticket_kind==='approval'?'Approval required':'Free admission'}</p></div>)}</div><Link href="/admin/events" className="primary-link">Edit ticket configuration</Link>
        </div>
      )}
    </div>
  );
}
