import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  Activity,
  LayoutDashboard,
  Map,
  ChartNoAxesCombined,
  BrainCircuit,
  Flame,
  MapPin,
  Info,
  Route as RouteIcon,
  ChevronRight,
  Sun,
  Moon,
  Menu,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTraffic } from './TrafficProvider';
import { LocationSearch } from './LocationSearch';

const navigation = [
  { to: '/' as const, title: 'Dashboard', icon: LayoutDashboard },
  { to: '/route-planner' as const, title: 'Route Planner', icon: RouteIcon },
  { to: '/live-traffic' as const, title: 'Live Traffic', icon: Map },
  { to: '/analytics' as const, title: 'Traffic Analytics', icon: ChartNoAxesCombined },
  { to: '/predictions' as const, title: 'Predictions', icon: BrainCircuit },
  { to: '/hotspots' as const, title: 'Congestion Hotspots', icon: Flame },
  { to: '/locations' as const, title: 'My Locations', icon: MapPin },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation({ select: l => l.pathname });
  const { theme, toggleTheme, health } = useTraffic();
  const [open, setOpen] = useState(false);
  const current =
    navigation.find(n => n.to === pathname)?.title ||
    (pathname === '/dashboard' || pathname === '/overview' ? 'Dashboard' : 'About & Data');

  return (
    <div className="app-shell">
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Button
          className="mobile-close"
          variant="ghost"
          size="icon"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
        <Link to="/" className="brand">
          <span className="brand-symbol">
            <Activity size={22} />
          </span>
          TrafficWatch<span className="text-primary">.</span>
        </Link>
        <p className="brand-subtitle">TRAFFIC INTELLIGENCE</p>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(n => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className={`nav-link ${pathname === n.to || (n.to === '/' && (pathname === '/dashboard' || pathname === '/overview')) ? 'active' : ''}`}
            >
              <n.icon />
              <span>{n.title}</span>
            </Link>
          ))}
          <div className="nav-divider" />
          <Link
            to="/about"
            onClick={() => setOpen(false)}
            className={`nav-link ${pathname === '/about' ? 'active' : ''}`}
          >
            <Info />
            <span>About & Data</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className={`status-dot ${health}`} />
            {health === 'online'
              ? 'Traffic service connected'
              : health === 'checking'
              ? 'Checking traffic service'
              : 'Traffic service offline'}
            <ArrowUpRight size={13} className="ml-auto" />
          </div>
          <div className="sidebar-footer">Powered by TomTom & OpenStreetMap</div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Button
              className="mobile-toggle"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <div className="breadcrumb">
              <span className="text-muted-foreground">Workspace</span>
              <ChevronRight />
              <span>{current}</span>
            </div>
          </div>
          <div className="topbar-tools">
            <LocationSearch compact />
            <Button
              variant="ghost"
              size="icon"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon /> : <Sun />}
            </Button>
            <div className="h-6 border-l border-border" />
            <div className="avatar" title="TrafficWatch workspace">
              TW
            </div>
          </div>
        </header>

        <div className="page">
          <div key={pathname} className="page-transition">
            {children}
          </div>
          <footer className="page-footer">
            <span>© 2026 TrafficWatch. A clearer view of the road ahead.</span>
            <span>
              Traffic data by TomTom <span className="mx-2">·</span> Map by OpenStreetMap
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
