import { Brand } from '@/components/brand';
import { eventDateLabel } from '@/lib/event-display';
import { useState } from 'react';
import { Link } from 'wouter';
import { Search, MapPin, ArrowRight, CalendarDays, Code2, Music, Trophy, UsersRound, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/hooks/use-events';
import { useCampStore, clubNames } from '@/lib/camp-store';

export default function DiscoverPage() {
  const [selectedClub, setSelectedClub] = useState('All clubs');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const { events: dbEvents } = useEvents();
  const { events: fallbackEvents } = useCampStore();
  const sourceEvents = dbEvents ?? fallbackEvents;
  const filtered = sourceEvents.filter(e => (selectedClub === 'All clubs' || e.club === selectedClub) && (category === 'All' || (e.category === 'Technical' ? 'Tech' : e.category) === category) && `${e.title} ${e.description} ${e.venue}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="discover-content">
    <div className="discover-intro"><span className="location-label"><MapPin size={14}/>Your campus</span><h1>Discover events</h1><p>Meet your people. Try something new. Make a memory.</p></div>
    <div className="discovery-tools"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input aria-label="Search events" placeholder="Search events…" value={search} onChange={e=>setSearch(e.target.value)} className="h-10 pl-9"/></div><select aria-label="Filter by club" className="filter" value={selectedClub} onChange={e=>setSelectedClub(e.target.value)}><option>All clubs</option>{clubNames.map(c=><option key={c}>{c}</option>)}</select></div>
    <section><div className="section-heading"><div><h2>{category === 'All' ? 'Popular events' : `${category} events`}</h2><p>{selectedClub === 'All clubs' ? 'Across your campus' : selectedClub}</p></div><span className="result-count">{filtered.length} events</span></div>
      {filtered.length ? <div className="discover-event-grid">{filtered.map(e=><Link key={e.id} href={`/e/${e.slug || e.id}`} className="discover-event"><img src={e.image} alt={e.title}/><div><p className="event-date">{eventDateLabel(e.date)} · {e.time}</p><h3>{e.title}</h3><p className="event-host">By {e.club}</p><p className="event-venue"><MapPin size={12}/>{e.venue}</p></div><ArrowRight className="event-arrow" size={16}/></Link>)}</div> : <div className="empty-events"><Search size={30}/><h3>No events found</h3><p>Try a different search or browse all events.</p><Button variant="secondary" onClick={()=>{setSearch('');setCategory('All');setSelectedClub('All clubs');}}>Clear filters<X size={14}/></Button></div>}
    </section>
    <section className="discovery-section"><div className="section-heading"><h2>Browse by category</h2></div><div className="category-grid">{[{name:'All',label:'Everything',icon:CalendarDays,tone:'all'},{name:'Tech',label:'Tech & ideas',icon:Code2,tone:'tech'},{name:'Cultural',label:'Arts & culture',icon:Music,tone:'culture'},{name:'Sports',label:'Sports & fitness',icon:Trophy,tone:'sports'},{name:'Networking',label:'Meet & connect',icon:UsersRound,tone:'all'}].map(({name,label,icon:Icon,tone})=><button key={name} className={`category-card category-${tone} ${category===name?'category-active':''}`} aria-pressed={category===name} onClick={()=>setCategory(name)}><Icon size={25}/><span><b>{label}</b><small>{sourceEvents.filter(e=>name==='All'||(e.category==='Technical'?'Tech':e.category)===name).length} events</small></span><ArrowRight size={15}/></button>)}</div></section>
    <section className="discovery-section"><div className="section-heading"><div><h2>Campus calendars</h2><p>Good communities make great events.</p></div><Link href="/clubs">Explore clubs<ArrowRight size={16}/></Link></div><div className="calendar-grid">{clubNames.map((name,i)=><button key={name} className="calendar-card" onClick={()=>setSelectedClub(selectedClub===name?'All clubs':name)} aria-pressed={selectedClub===name}><span className={`calendar-icon calendar-${i%4}`}><UsersRound size={22}/></span><span><b>{name}</b><small>{sourceEvents.filter(e=>e.club===name).length} events · Campus community</small></span><span className="calendar-browse">{selectedClub===name?'Selected':'Browse'}</span></button>)}</div></section>
    <footer className="workspace-footer"><Brand/><Link href="/admin/login">Host your own event<ArrowRight size={14}/></Link></footer>
  </main>;
}
