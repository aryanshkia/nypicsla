// Judge view (judge.html). Needs the judge PIN; each judge takes one seat (J1 to J3).
import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import { store, PUBLIC_PATHS } from './store.js';
import { ASSETS, CLIENTS, TEAM_IDS, JUDGE_IDS, PITCH_CRITERIA } from './config.js';
import { cleanAlloc, mandate, fmtClock } from './game.js';
import { useGame, useToast, phaseOf, timerLeft, OfflineBar, Loading, Check, load, save } from './ui.js';

function App() {
  const { state, now, status, error, uid } = useGame(PUBLIC_PATHS);
  const [me, setMe] = useState(load('fmfh-judge', null)); // { slot, pin }
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (state && me) store.set(`judges/${store.uid}`, { slot: me.slot, k: me.pin }).catch(() => { save('fmfh-judge', null); setMe(null); });
  }, [!!state]);
  if (!state) return html`<${Loading} error=${error} />`;
  if (!me) return html`<${Login} onIn=${m => { save('fmfh-judge', m); setMe(m); }} />${toast}`;
  return html`<${Score} state=${state} now=${now} slot=${me.slot} toast=${showToast} />${toast}<${OfflineBar} status=${status} />`;
}

function Login({ onIn }) {
  const [slot, setSlot] = useState(null); const [pin, setPin] = useState(''); const [err, setErr] = useState('');
  const go = async e => {
    e.preventDefault();
    if (!slot) return setErr('Pick your judge seat.');
    try { await store.set(`judges/${store.uid}`, { slot, k: pin.trim() }); onIn({ slot, pin: pin.trim() }); }
    catch { setErr('Wrong PIN.'); }
  };
  return html`<div class="phone"><header class="phone-head"><span class="title">Judge panel</span><span class="sub">Fund Manager for Hire</span></header>
    <form class="phone-body" onSubmit=${go}>
      <span class="eyebrow">Your seat</span>
      <div class="roles">${JUDGE_IDS.map(j => html`<button type="button" class="role" aria-pressed=${slot === j} onClick=${() => setSlot(j)}>Judge ${j.slice(1)}</button>`)}</div>
      <label class="field">Judge PIN<input type="password" inputmode="numeric" value=${pin} onInput=${e => setPin(e.target.value)} /></label>
      ${err && html`<div class="note warn" role="alert">${err}</div>`}
      <button class="btn primary block">Start judging</button>
    </form></div>`;
}

function Score({ state, now, slot, toast }) {
  const pitching = state.game?.pitchTeam || 1;
  const [team, setTeam] = useState(pitching);
  useEffect(() => setTeam(pitching), [pitching]);
  const saved = state.scores?.[slot]?.[team] || {};
  const [vals, setVals] = useState({});
  useEffect(() => setVals({ fit: saved.fit, event: saved.event, clarity: saved.clarity }), [team, saved.at]);
  const complete = PITCH_CRITERIA.every(c => vals[c.id]);
  const c = CLIENTS[team];
  const t = state.teams?.[team] || {};
  const alloc = cleanAlloc(t.r2?.alloc || t.r1?.alloc || {});
  const submit = async () => {
    try { await store.set(`scores/${slot}/${team}`, { ...vals, at: store.now() }); toast(`Team ${team} scored.`); }
    catch (e) { toast(e.message); }
  };
  const left = timerLeft(state, now);
  return html`<div class="phone">
    <header class="phone-head">
      <div class="row between"><span class="title">Judge ${slot.slice(1)} · You are ${c.name}</span>
        ${phaseOf(state) === 'pitch' && state.game?.timer ? html`<span class=${'clock' + (left < 15000 ? ' low' : '')}>${fmtClock(left)}</span>` : null}</div>
      <div class="row gap6 wrap">${TEAM_IDS.map(id => html`<button type="button" class="pill" style=${`border:none;min-height:32px;cursor:pointer;background:${id === team ? '#2557D6' : '#17263D'};color:#fff`} onClick=${() => setTeam(id)}>T${id}${state.scores?.[slot]?.[id] ? ' ✓' : ''}</button>`)}</div>
    </header>
    <main class="phone-body">
      <div class="card stack gap8">
        <span class="eyebrow">${team === pitching ? 'Pitching now' : 'Team'} · Team ${team}</span>
        <span class="display" style="font-size:20px;font-weight:700">${c.name}, ${c.age}</span>
        <span class="muted" style="font-size:14px">${c.blurb}</span>
        ${t.inbox?.event ? html`<div class="note info"><b>Their call:</b> "${t.inbox.event.text}"</div>` : null}
      </div>
      <div class="card stack gap8"><span class="eyebrow">Final portfolio</span>
        ${ASSETS.filter(a => alloc[a.id]).map(a => html`<div class="row between" style="font-size:14px"><span>${a.name}</span><span class="mono">${alloc[a.id]}%</span></div>`)}
        ${mandate(team, alloc).map(r => html`<div class="rule"><${Check} ok=${r.ok} /><span>${r.label}</span></div>`)}
      </div>
      ${PITCH_CRITERIA.map(cr => html`<section class="stack gap8"><span class="eyebrow">${cr.label}</span>
        <div class="score-row" role="group" aria-label=${cr.label}>${[1, 2, 3, 4, 5].map(n => html`<button type="button" class="score-btn" aria-pressed=${vals[cr.id] === n} onClick=${() => setVals({ ...vals, [cr.id]: n })}>${n}</button>`)}</div></section>`)}
      <button class="btn primary block" disabled=${!complete} onClick=${submit}>${saved.at ? 'Update score' : 'Submit score'} for Team ${team}</button>
      <p class="muted center" style="font-size:12px;margin:0">1 = weak, 5 = excellent. You can change a score any time before final results.</p>
    </main></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
