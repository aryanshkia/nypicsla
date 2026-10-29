// One small interface over two backends:
//   local    -> the WebSocket dev server in server.js (for testing and rehearsal)
//   firebase -> Firebase Realtime Database with anonymous sign-in (for the event)
// Both enforce the same permissions (see rules.js and database.rules.json).
import { BACKEND, FIREBASE } from './config.js';

function localUid() {
  try {
    let id = localStorage.getItem('fmfh-uid');
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 12); localStorage.setItem('fmfh-uid', id); }
    return id;
  } catch { return 'u' + Math.random().toString(36).slice(2, 12); }
}

function makeLocal() {
  let ws, uid = localUid(), tree = {}, offset = 0, seq = 0;
  const pending = new Map();
  const listeners = new Set();
  let status = 'connecting';
  const statusListeners = new Set();
  const setStatus = s => { status = s; statusListeners.forEach(f => f(s)); };

  function open(resolve) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', uid })); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t === 'tree') {
        tree = m.tree || {};
        offset = m.now - Date.now();
        if (status !== 'online') setStatus('online');
        resolve?.(uid); resolve = null;
        listeners.forEach(f => f(tree));
      } else if (m.t === 'ack') {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); m.ok ? p.res() : p.rej(new Error(m.err || 'denied')); }
      }
    };
    ws.onclose = () => { setStatus('offline'); setTimeout(() => open(), 1500); };
  }

  const send = (t, path, value) => new Promise((res, rej) => {
    if (!ws || ws.readyState !== 1) return rej(new Error('offline'));
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ t, id, path, value }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 8000);
  });

  return {
    kind: 'local',
    connect: () => new Promise(res => open(res)),
    get uid() { return uid; },
    subscribe(_paths, cb) { listeners.add(cb); if (status === 'online') cb(tree); return () => listeners.delete(cb); },
    set: (path, value) => send('set', path, value),
    update: (path, value) => send('update', path, value),
    now: () => Date.now() + offset,
    onStatus(cb) { statusListeners.add(cb); cb(status); return () => statusListeners.delete(cb); },
  };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

function makeFirebase() {
  let db, uid, offset = 0;
  const tree = {};
  const statusListeners = new Set();
  let status = 'connecting';
  const setStatus = s => { status = s; statusListeners.forEach(f => f(s)); };
  const V = '10.12.2';
  return {
    kind: 'firebase',
    async connect() {
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-auth-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-database-compat.js`);
      const fb = window.firebase;
      fb.initializeApp(FIREBASE);
      const cred = await fb.auth().signInAnonymously();
      uid = cred.user.uid;
      db = fb.database();
      db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
      db.ref('.info/connected').on('value', s => setStatus(s.val() ? 'online' : 'offline'));
      return uid;
    },
    get uid() { return uid; },
    subscribe(paths, cb) {
      const offs = paths.map(p => {
        const ref = db.ref(p);
        const h = ref.on('value', s => { tree[p] = s.val(); cb({ ...tree }); }, () => { /* no permission: leave empty */ });
        return () => ref.off('value', h);
      });
      return () => offs.forEach(f => f());
    },
    set: (path, value) => db.ref(path).set(value),
    update: (path, value) => db.ref(path || '/').update(value),
    now: () => Date.now() + offset,
    onStatus(cb) { statusListeners.add(cb); cb(status); return () => statusListeners.delete(cb); },
  };
}

export const store = BACKEND === 'firebase' ? makeFirebase() : makeLocal();

// Paths each view listens to. Hidden and secret nodes are host-only.
export const PUBLIC_PATHS = ['game', 'teams', 'scores', 'public', 'members', 'judges'];
export const HOST_PATHS = [...PUBLIC_PATHS, 'hidden', 'secrets', 'hosts'];
