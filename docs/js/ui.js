// Shared UI helpers for all four views.
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { store } from './store.js';
import { PHASES } from './config.js';
import { remainingMs } from './game.js';

export function useGame(paths) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  useEffect(() => {
    let off;
    const offStatus = store.onStatus(setStatus);
    store.connect()
      .then(() => { off = store.subscribe(paths, t => setState(t)); })
      .catch(e => setError(e.message || String(e)));
    const iv = setInterval(() => setNow(store.now()), 250);
    return () => { off && off(); offStatus(); clearInterval(iv); };
  }, []);
  return { state, now, status, error, uid: store.uid };
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = m => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 3200); };
  const node = msg ? html`<div class="toast" role="status">${msg}</div>` : null;
  return [node, show];
}

export const phaseOf = state => state?.game?.phase || 'lobby';
export const phaseLabel = id => PHASES.find(p => p.id === id)?.label || id;
export const timerLeft = (state, now) => remainingMs(state?.game?.timer, now);

export const OfflineBar = ({ status }) =>
  status === 'offline' ? html`<div class="offline-bar" role="status">Reconnecting… your changes will sync when you're back online.</div>` : null;

export const Loading = ({ error }) => html`
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:var(--body);color:var(--muted)">
    ${error ? html`<div><b style="color:var(--ink)">Couldn't connect.</b><br/>${error}</div>` : 'Connecting…'}
  </div>`;

export const Check = ({ ok, size = 20 }) => ok
  ? html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="#0F6B40" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.5 2.5L16 9.5"></path></svg>`
  : html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="#8A4B00" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.2v.3"></path></svg>`;

export const Alert = () => html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l9 16H3z"></path><path d="M12 10v4M12 17v.5"></path></svg>`;

export const Phone = () => html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2557D6" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"></path></svg>`;

export const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
