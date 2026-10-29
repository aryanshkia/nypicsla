// Team phone view (index.html).
import { html, render, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { store, PUBLIC_PATHS } from './store.js';
import { ASSETS, CLIENTS, TEAM_IDS, ROLES, MAX_HOLDING_PCT, STEP_PCT, CAPITAL } from './config.js';
import { emptyAlloc, cleanAlloc, total, mandate, blockers, portfolio, leaderboard, fmtClock, fmtMoney, fmtPct } from './game.js';
import { useGame, useToast, phaseOf, phaseLabel, timerLeft, OfflineBar, Loading, Check, Alert, Phone, load, save } from './ui.js';

function App() {
  const { state, now, status, error, uid } = useGame(PUBLIC_PATHS);
  const [me, setMe] = useState(load('fmfh-team', null)); // { team, code }
  const [toast, showToast] = useToast();

  // Re-claim membership after a reload (harmless if already set).
  useEffect(() => {
    if (state && me && store.uid) store.set(`members/${store.uid}`, { team: String(me.team), k: me.code }).catch(() => {
      save('fmfh-team', null); setMe(null); showToast('Please rejoin your team.');
    });
  }, [!!state]);

  if (!state) return html`<${Loading} error=${error} />`;
  if (!me) return html`<${Join} onJoined=${m => { save('fmfh-team', m); setMe(m); }} />${toast}<${OfflineBar} status=${status} />`;
  return html`<${Team} state=${state} now=${now} me=${me} uid=${uid} toast=${showToast}
    onLeave=${() => { store.set(`members/${store.uid}`, null).catch(() => {}); save('fmfh-team', null); setMe(null); }} />${toast}<${OfflineBar} status=${status} />`;
}

function Join({ onJoined }) {
  const [team, setTeam] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async e => {
    e.preventDefault();
    if (!team) return setErr('Pick your team number first.');
    setBusy(true); setErr('');
    try {
      await store.set(`members/${store.uid}`, { team: String(team), k: code.trim() });
      onJoined({ team, code: code.trim() });
    } catch { setErr("That code doesn't match this team. Check with your marshal."); }
    setBusy(false);
  };
  return html`
  <div class="phone">
    <header class="phone-head"><span class="title">Fund Manager for Hire</span><span class="sub">NYP Investment Club · Young Investors Workshop</span></header>
    <form class="phone-body" onSubmit=${join}>
      <div class="stack gap6"><h1 class="display" style="margin:0;font-size:26px">Join your team</h1>
        <span class="muted" style="font-size:14px">Your marshal will give your table a 4-digit code.</span></div>
      <div class="stack gap8"><span class="eyebrow">Team number</span>
        <div class="roles">${TEAM_IDS.map(t => html`<button type="button" class="role" aria-pressed=${team === t} onClick=${() => setTeam(t)}>Team ${t}</button>`)}</div></div>
      <label class="field">Team code
        <input inputmode="numeric" autocomplete="off" maxlength="6" value=${code} onInput=${e => setCode(e.target.value)} placeholder="4 digits" /></label>
      ${err && html`<div class="note warn" role="alert">${err}</div>`}
      <button class="btn primary block" disabled=${busy}>Join team</button>
      <p class="muted center" style="font-size:11px;margin-top:auto">Learning tool only. No real money. Not financial advice.</p>
    </form>
  </div>`;
}

function Team({ state, now, me, uid, toast, onLeave }) {
  const phase = phaseOf(state);
  const team = state.teams?.[me.team] || {};
  const client = CLIENTS[me.team];
  const left = timerLeft(state, now);
  const timed = ['brief', 'r1', 'shock', 'r2', 'pitch'].includes(phase) && state.game?.timer;
  const editing = phase === 'r1' || phase === 'r2';
  return html`
  <div class="phone">
    <header class="phone-head">
      <div class="row between">
        <span class="title">${editing ? `${client.name}'s portfolio` : 'Fund Manager for Hire'}</span>
        ${timed ? html`<span class=${'clock' + (left < 60000 ? ' low' : '')} aria-label="Time left">${fmtClock(left)}</span>` : null}
      </div>
      <div class="row gap8"><span class="pill blue">Team ${me.team}</span><span class="sub">${phaseLabel(phase)}</span></div>
    </header>
    ${(phase === 'shock' || phase === 'r2') && state.public?.news ? html`<div class="news-strip"><${Alert} /><span>Breaking: ${state.public.news.headline}</span></div>` : null}
    <main class="phone-body">
      ${phase === 'lobby' && html`<${Lobby} me=${me} team=${team} uid=${uid} onLeave=${onLeave} />`}
      ${phase === 'brief' && html`<${ClientCard} id=${me.team} /><${Roles} me=${me} team=${team} uid=${uid} />`}
      ${editing && html`<${Editor} state=${state} me=${me} team=${team} round=${phase} toast=${toast} />`}
      ${phase === 'shock' && html`<div class="note info">Watch the big screen. Round 2 opens in a moment and your client may call you.</div><${ClientCard} id=${me.team} />`}
      ${phase === 'reveal' && html`<${Result} state=${state} me=${me} />`}
      ${phase === 'pitch' && html`<${PitchPrep} state=${state} me=${me} team=${team} />`}
      ${phase === 'final' && html`<${Final} state=${state} me=${me} />`}
    </main>
  </div>`;
}

function Lobby({ me, team, uid, onLeave }) {
  return html`
    <div class="card stack gap8"><span class="eyebrow">You're in</span>
      <span class="display" style="font-size:24px;font-weight:700">Team ${me.team}</span>
      <span class="muted" style="font-size:14px">Waiting for the host to start. Pick your role while you wait.</span></div>
    <${Roles} me=${me} team=${team} uid=${uid} />
    <button class="btn sm" style="align-self:flex-start" onClick=${onLeave}>Wrong team? Leave</button>`;
}

function ClientCard({ id }) {
  const c = CLIENTS[id];
  return html`
  <section class="card stack gap12">
    <span class="eyebrow">Your client</span>
    <div class="row gap12"><div class="avatar">${c.initial}</div>
      <div class="stack gap4"><h1 class="display" style="margin:0;font-size:24px">${c.name}, ${c.age}</h1><span class="muted" style="font-size:14px">${c.blurb}</span></div></div>
    <div class="row gap8 wrap">${c.profile.map((p, i) => html`<span class=${'pill ' + (i ? 'grey' : 'warn')}>${p}</span>`)}</div>
    <p style="margin:0;font-size:14px;line-height:1.5;color:var(--ink-2)">"${c.quote}"</p>
    <span class="eyebrow" style="margin-top:4px">Mandate rules · 10 pts each</span>
    ${c.rules.map(r => html`<div class="rule"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2557D6" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.5 2.5L16 9.5"></path></svg><span>${r.label}</span></div>`)}
    <div class="note info">Capital: ${fmtMoney(CAPITAL)}. No holding above ${MAX_HOLDING_PCT}%. Every pick needs a one-line reason.</div>
  </section>`;
}

function Roles({ me, team, uid }) {
  const roles = team.roles || {};
  const mine = Object.entries(roles).find(([, v]) => v?.uid === uid)?.[0];
  const claim = r => {
    const upd = {};
    if (mine && mine !== r) upd[`roles/${mine}`] = null;
    upd[`roles/${r}`] = { uid, at: store.now() };
    store.update(`teams/${me.team}`, upd).catch(() => {});
  };
  return html`
  <section class="stack gap8"><span class="eyebrow">Your role</span>
    <div class="roles">${ROLES.map(r => {
      const owner = roles[r]?.uid;
      return html`<button type="button" class="role" aria-pressed=${owner === uid} onClick=${() => claim(r)}>${r}<span class="who">${owner === uid ? 'You' : owner ? 'Taken' : 'Open'}</span></button>`;
    })}</div>
  </section>`;
}

function Editor({ state, me, team, round, toast }) {
  const locked = !!state.game?.locked?.[round];
  const draftOk = team.draft?.round === round;
  const base = round === 'r2' ? (team.r1 || {}) : {};
  const alloc = cleanAlloc(draftOk ? team.draft.alloc : base.alloc || emptyAlloc());
  const remoteReasons = (draftOk ? team.draft.reasons : base.reasons) || {};
  const [localReasons, setLocalReasons] = useState({});
  const timers = useRef({});
  const reasons = { ...remoteReasons, ...localReasons };
  const sub = team[round];
  const t = total(alloc);
  const rules = mandate(me.team, alloc);
  const blocks = blockers(alloc, reasons);
  const event = round === 'r2' ? team.inbox?.event : null;
  const seenKey = `fmfh-event-${me.team}-${event?.at || 0}`;
  const [dismissed, setDismissed] = useState(null);
  const eventSeen = load(seenKey, false) || (event && dismissed === event.at);
  const rumour = round === 'r2' ? team.inbox?.rumour : null;
  const prevRumour = useRef(rumour?.at);
  useEffect(() => { if (rumour && rumour.at !== prevRumour.current) { toast('New message from a friend in finance'); prevRumour.current = rumour.at; } }, [rumour?.at]);

  // Start this round's shared draft from the right place (Round 2 starts from Round 1).
  useEffect(() => {
    if (!draftOk && !locked) {
      store.set(`teams/${me.team}/draft`, { round, alloc: cleanAlloc(base.alloc || emptyAlloc()), reasons: base.reasons || {} }).catch(() => {});
    }
  }, [round, draftOk]);

  const change = (id, delta) => {
    if (locked) return;
    const next = Math.max(0, Math.min(MAX_HOLDING_PCT, alloc[id] + delta));
    if (delta > 0 && t + STEP_PCT > 100) return toast('You have already allocated 100%.');
    const write = draftOk
      ? store.update(`teams/${me.team}/draft`, { round, [`alloc/${id}`]: next })
      : store.set(`teams/${me.team}/draft`, { round, alloc: { ...alloc, [id]: next }, reasons });
    write.catch(() => toast('Not saved. Time may be up.'));
  };
  const typeReason = (id, v) => {
    setLocalReasons(r => ({ ...r, [id]: v }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      store.update(`teams/${me.team}/draft`, { round, [`reasons/${id}`]: v.slice(0, 120) })
        .then(() => setLocalReasons(r => { const c = { ...r }; delete c[id]; return c; }))
        .catch(() => toast('Not saved. Time may be up.'));
    }, 350);
  };
  const submit = async () => {
    if (blocks.length) return toast(blocks[0]);
    const clean = Object.fromEntries(Object.entries(reasons).filter(([k, v]) => alloc[k] > 0 && v).map(([k, v]) => [k, String(v).slice(0, 120)]));
    try { await store.set(`teams/${me.team}/${round}`, { alloc, reasons: clean, at: store.now() }); toast('Submitted. You can still change and resubmit until time is up.'); }
    catch { toast('Could not submit. Time may be up.'); }
  };
  const sameAsSubmitted = sub && JSON.stringify(cleanAlloc(sub.alloc)) === JSON.stringify(alloc);

  return html`
    ${event && !eventSeen ? html`
      <div class="overlay"><section class="card" role="dialog" aria-modal="true" aria-label="Client call">
        <div class="row gap12"><div class="avatar" style="width:44px;height:44px"><${Phone} /></div>
          <div class="stack gap4"><span class="eyebrow" style="color:var(--blue)">Incoming client call</span><span class="display" style="font-size:20px;font-weight:700">${CLIENTS[me.team].name} has news</span></div></div>
        <p style="margin:0;font-size:15px;line-height:1.55">"${event.text}"</p>
        <div class="note info">Your pitch will be judged on how you respond to this.</div>
        <button class="btn primary block" onClick=${() => { save(seenKey, true); setDismissed(event.at); }}>Adjust portfolio</button>
      </section></div>` : null}
    ${event && eventSeen ? html`<div class="note info"><b>${CLIENTS[me.team].name}:</b> "${event.text}"</div>` : null}
    ${rumour ? html`<section class="tip" aria-label="Rumour tip"><div class="row between"><b style="font-size:13px">Message from a friend in finance</b><span class="pill" style="border:1px solid var(--amber);color:var(--amber)">Unverified</span></div><p>"${rumour.text}"</p><span style="font-size:11px;color:var(--muted-dark)">Some tips are right. Some are not. Decide as a team.</span></section>` : null}

    <div class="stack gap6">
      <div class="row between" style="font-size:13px"><span class="muted">Allocated</span><span class="mono">${t}% · ${fmtMoney(CAPITAL * (100 - t) / 100)} left</span></div>
      <div class=${'bar' + (t === 100 ? ' full' : '')} style="background:#DDE3EC"><div style=${`width:${Math.min(100, t)}%`}></div></div>
    </div>
    <div class="row gap6 wrap">${rules.map(r => html`<span class=${'pill ' + (r.ok ? 'ok' : 'warn')}>${r.ok ? '✓' : '✗'} ${r.label}</span>`)}</div>
    ${locked ? html`<div class="note warn">Time's up. This round is locked.</div>` : null}

    ${ASSETS.map(a => html`
      <div class=${'asset' + (alloc[a.id] ? ' on' : '')}>
        <div class="row gap10">
          <div class="grow stack gap4"><span class="name">${a.name}</span><span class="meta">${a.id === 'CASH' ? '' : a.id + ' · '}${a.type}</span></div>
          <button type="button" class="step" aria-label=${`Decrease ${a.short}`} disabled=${locked || !alloc[a.id]} onClick=${() => change(a.id, -STEP_PCT)}>−</button>
          <span class="pct" aria-live="polite">${alloc[a.id]}%</span>
          <button type="button" class="step" aria-label=${`Increase ${a.short}`} disabled=${locked || alloc[a.id] >= MAX_HOLDING_PCT || t >= 100} onClick=${() => change(a.id, STEP_PCT)}>+</button>
        </div>
        ${alloc[a.id] > 0 ? html`<label class="stack gap4" style="font-size:11px;color:var(--muted)">Why this pick, for ${CLIENTS[me.team].name}?
          <input class=${'reason' + (String(reasons[a.id] || '').trim() ? '' : ' missing')} maxlength="120" disabled=${locked} value=${reasons[a.id] || ''} onInput=${e => typeReason(a.id, e.target.value)} /></label>` : null}
      </div>`)}

    ${!locked && blocks.length ? html`<div class="note warn">${blocks[0]}</div>` : null}
    ${sub ? html`<div class=${'note ' + (sameAsSubmitted ? 'ok' : 'warn')}>${sameAsSubmitted ? 'Submitted. Your latest version is in.' : 'You have changes that are not submitted yet.'}</div>` : null}
    <button class="btn primary block" disabled=${locked || blocks.length > 0} onClick=${submit}>${sub ? 'Resubmit' : 'Submit'} ${round === 'r1' ? 'Round 1' : 'Round 2'}</button>
    ${round === 'r2' ? html`<p class="muted center" style="font-size:12px;margin:0">${state.game?.settings?.fee ? 'Switching fee on: moving money costs 0.5% of the amount moved.' : 'If you do not resubmit, your Round 1 portfolio is kept.'}</p>` : null}`;
}

function Result({ state, me }) {
  const p = portfolio(me.team, state.teams?.[me.team], state.public?.returns, state.game?.settings);
  if (!p || (state.game?.revealStep || 0) < 3) return html`<div class="card stack gap8 center"><span class="eyebrow">Returns reveal</span><span class="display" style="font-size:22px;font-weight:700">Eyes on the big screen</span><span class="muted" style="font-size:14px">Your result appears here once the host reveals portfolios.</span></div>`;
  return html`<div class="card stack gap8"><span class="eyebrow">Your portfolio</span>
    <span class="display" style="font-size:34px;font-weight:700">${fmtMoney(p.v2)}</span>
    <span class=${'pill ' + (p.twr >= 0 ? 'ok' : 'bad')} style="align-self:flex-start">${fmtPct(p.twr)} return</span>
    ${p.bonus ? html`<span class="muted" style="font-size:13px">Includes the client's ${fmtMoney(p.bonus)} top-up. Return excludes it.</span>` : null}
    ${p.fee ? html`<span class="muted" style="font-size:13px">Switching fees paid: ${fmtMoney(p.fee)}</span>` : null}</div>`;
}

function PitchPrep({ state, me, team }) {
  const up = state.game?.pitchTeam === me.team;
  const finalAlloc = cleanAlloc(team.r2?.alloc || team.r1?.alloc || {});
  const rules = mandate(me.team, finalAlloc);
  return html`
    <div class=${'card stack gap8' + (up ? '' : '')} style=${up ? 'border:2px solid var(--blue);background:var(--blue-soft)' : ''}>
      <span class="eyebrow">${up ? 'You are up' : 'Pitches'}</span>
      <span class="display" style="font-size:22px;font-weight:700">${up ? 'Spokesperson, 60 seconds. Go!' : `Pitch to ${CLIENTS[me.team].name} in 60 seconds`}</span>
      <span class="muted" style="font-size:14px">Cover three things: why this mix fits the client, how you responded to their call, and what you'd watch next.</span>
    </div>
    <div class="card stack gap8"><span class="eyebrow">Your final portfolio</span>
      ${ASSETS.filter(a => finalAlloc[a.id]).map(a => html`<div class="row between" style="font-size:14px"><span>${a.name}</span><span class="mono">${finalAlloc[a.id]}%</span></div>`)}
      <span class="eyebrow" style="margin-top:6px">Mandate</span>
      ${rules.map(r => html`<div class="rule"><${Check} ok=${r.ok} /><span>${r.label}</span></div>`)}
    </div>
    ${team.inbox?.event ? html`<div class="note info"><b>Their call:</b> "${team.inbox.event.text}"</div>` : null}`;
}

function Final({ state, me }) {
  const rows = leaderboard(state);
  const i = rows.findIndex(r => r.id === me.team);
  const r = rows[i];
  return html`<div class="card stack gap12"><span class="eyebrow">Final result</span>
    <span class="display" style="font-size:34px;font-weight:700">#${i + 1} · ${r.total} pts</span>
    <div class="kv"><span>Return</span><b class="mono">${r.returnPts} / 40</b><span>Mandate fit</span><b class="mono">${r.mandatePts} / 30</b><span>Pitch</span><b class="mono">${r.pitch.points} / 30</b></div>
    ${i === 0 ? html`<div class="note ok">You're hired! Congratulations.</div>` : null}
    <p class="muted" style="font-size:12px;margin:0">Learning tool only. Not financial advice.</p></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
