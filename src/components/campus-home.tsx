import { eventDateLabel } from '@/lib/event-display';
import { Link } from 'wouter';
import { ArrowRight, MapPin, ArrowUpRight, CalendarDays } from 'lucide-react';
import { Brand } from './brand';
import { SiteHeader } from './site-header';
import { useCampStore } from '@/lib/camp-store';

export function CampusHome() {
  const { events } = useCampStore();
  const featured = events.slice(0, 3);
  return <div className="public-site"><SiteHeader/>
    <main className="home-content">
      <section className="home-hero">
        <div className="hero-copy"><span className="hero-kicker"><span/>A little more campus. A lot more connection.</span>
          <h1>Great events.<br/>Your people.<br/><span>Right here.</span></h1>
          <p>From late-night gigs to your next big idea.<br className="hidden sm:block"/> Find what’s happening, and be part of it.</p>
          <div className="hero-actions"><Link href="/discover" className="primary-link">Discover events<ArrowRight size={18}/></Link><Link href="/admin/login" className="quiet-link">Host an event<ArrowUpRight size={17}/></Link></div>
          <div className="hero-community"><div className="mini-avatars">{['R','A','S','K'].map(n=><span key={n}>{n}</span>)}</div><span>A campus full of people to meet.</span></div>
        </div>
        <div className="poster-stage" aria-label="Featured campus events">
          <div className="poster-orbit"/>
          {featured.map((e,i)=><Link key={e.id} href={`/e/${e.slug || e.id}`} className={`hero-poster poster-${i}`}>
            <img src={e.image} alt={e.title}/><div className="poster-caption"><span>{e.club}</span><h2>{e.title}</h2><p><CalendarDays size={13}/>{eventDateLabel(e.date)} · {e.time}</p></div>
          </Link>)}
          <span className="poster-note">Good things happen when you show up. ↗</span>
        </div>
      </section>
      <section className="home-events"><div className="section-heading"><div><h2>Happening on campus</h2><p>Your next “glad I went” starts here.</p></div><Link href="/discover">View all events<ArrowRight size={16}/></Link></div>
        <div className="home-event-grid">{events.slice(0,4).map(e=><Link key={e.id} href={`/e/${e.slug || e.id}`} className="home-event"><img src={e.image} alt={e.title}/><div><p className="event-date">{eventDateLabel(e.date)} · {e.time}</p><h3>{e.title}</h3><p className="event-host">By {e.club}</p><p className="event-venue"><MapPin size={13}/>{e.venue}</p></div></Link>)}</div>
      </section>
      <section className="host-invitation"><div><span className="hero-kicker">FOR THE PEOPLE WHO BRING PEOPLE TOGETHER</span><h2>Make something worth showing up for.</h2><p>A home for your club, your next event, and everyone on the guest list.</p></div><Link href="/admin/login" className="primary-link">Create an event<ArrowRight size={17}/></Link></section>
    </main><footer className="site-footer"><Brand/><span>Made for campus moments.</span><Link href="/discover">Discover</Link><Link href="/admin/login">For hosts</Link><Link href="/login">Sign in</Link></footer>
  </div>;
}
