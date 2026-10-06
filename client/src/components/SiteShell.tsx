import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowUpRight, HeartPulse, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth, useTheme } from '../app/providers';

export function SiteShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { session } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const closeMenu = () => setMenuOpen(false);
  return <>
    <header className="site-header">
      <Link to="/" className="brand-lockup" onClick={closeMenu} aria-label="Smart Healthcare home">
        <span className="brand-mark"><HeartPulse size={19} strokeWidth={2.4} /></span>
        <span>smart<span className="brand-light">care</span><small>CONNECTED HEALTH</small></span>
      </Link>
      <button className="icon-button mobile-menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav className={`site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <NavLink to="/services" onClick={closeMenu}>Services</NavLink>
        <NavLink to="/architecture" onClick={closeMenu}>Architecture</NavLink>
        <NavLink to="/about" onClick={closeMenu}>About</NavLink>
        <NavLink to="/contact" onClick={closeMenu}>Contact</NavLink>
        <button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`Switch to ${dark ? 'light' : 'dark'} mode`}>
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {session ? <Link to="/app" className="button button-primary nav-cta" onClick={closeMenu}>Open workspace <ArrowUpRight size={15} /></Link>
          : <Link to="/login" className="button button-primary nav-cta" onClick={closeMenu}>Sign in <ArrowUpRight size={15} /></Link>}
      </nav>
    </header>
    <main><Outlet /></main>
    <footer className="site-footer">
      <div className="footer-top">
        <Link to="/" className="brand-lockup"><span className="brand-mark"><HeartPulse size={19} /></span><span>smart<span className="brand-light">care</span><small>CONNECTED HEALTH</small></span></Link>
        <p>Care moves better when information moves with it.</p>
        <div className="footer-links"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link></div>
      </div>
      <div className="footer-bottom"><span>© 2026 Smart Healthcare Cloud Platform</span><span>Decision support, not a diagnosis.</span></div>
    </footer>
  </>;
}