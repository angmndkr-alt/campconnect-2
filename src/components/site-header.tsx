import { Brand } from './brand';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Compass, Moon, Sun, UsersRound } from 'lucide-react';
import { useCampStore } from '@/lib/camp-store';
import { Button } from '@/components/ui/button';

export function SiteHeader() {
  const { auth, theme, toggleTheme } = useCampStore();
  const [path] = useLocation();
  return <header className="site-header">
    <Brand/>
    <nav aria-label="Main navigation" className="site-links">
      <Link href="/discover" className={path === '/discover' ? 'selected' : ''}><Compass size={16}/>Discover</Link>
      <Link href={auth?.role === 'admin' ? '/admin/events' : '/events'} className={path === '/events' ? 'selected' : ''}><CalendarDays size={16}/>Events</Link>
      {auth?.role === 'admin' ? (
        <Link href="/admin" className={path === '/admin' ? 'selected' : ''}>Workspace</Link>
      ) : (
        <>
          <Link href="/clubs" className={path === '/clubs' ? 'selected' : ''}><UsersRound size={16}/>Clubs</Link>
          <Link href="/calendar" className={path === '/calendar' ? 'selected' : ''}><CalendarDays size={16}/>Calendar</Link>
        </>
      )}
    </nav>
    <div className="site-actions">
      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun/> : <Moon/>}</Button>

      <Link href={auth ? auth.role === 'admin' ? '/admin/profile' : '/profile' : '/login'} className="header-signin">{auth ? auth.name.split(' ')[0] : 'Sign in'}</Link>
    </div>
  </header>;
}
