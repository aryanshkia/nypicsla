// Game master console (host.html). Needs the host PIN.
import { html, render, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { store, HOST_PATHS } from './store.js';
import { ASSETS, CLIENTS, TEAM_IDS, PHASES, JUDGE_IDS } from './config.js';
import { cleanAlloc, emptyAlloc, total, isValid, mandate, leaderboard, fmtClock, fmtMoney, fmtPct, remainingMs } from './game.js';
import { useGame, useToast, phaseOf, phaseLabel, OfflineBar, Loading, load, save } from './ui.js';

const phaseIdx = id => PHASES.findIndex(p => p.id === id);
const secsFor = id => PHASES.find(p => p.id === id)?.secs || 0;

function App() {
  const { state, now, status, error, uid } = useGame(HOST_PATHS);
  const [toast, showToast] = useToast();
  const [pin, setPin] = useState(load('fmfh-host-pin', ''));
  const isHost = !!state?.hosts?.[uid];
  useEffect(() => {
    if (state && pin && !isHost) store.set(`hosts/${store.uid}`, { k: pin }).catch(() => { save('fmfh-host-pin', ''); setPin(''); });
  }, [!!state]);
  if (!state) return html`<${Loading} error=${error} />`;
  if (!isHost) return html`<${Login} onPin=${p => { save('fmfh-host-pin', p); setPin(p); }} />${toast}`;
  return html`<${Console} state=${state} now=${now} toast=${showToast} />${toast}<${OfflineBar} status=${status} />`;
}

function Login({ onPin }) {
  const [v, setV] = useState(''); const [err, setErr] = useState('');
  const go = async e => {
    e.preventDefault();
    try {
      await store.set(`hosts/${store.uid}`, { k: v.trim() }); onPin(v.trim());
      if (store.kind === 'firebase') location.reload(); // re-open the host-only listeners now that access is granted
    }
    catch { setErr('Wrong PIN.'); }
  };
  return html`<form onSubmit=${go} style="max-width:360px;margin:12vh auto;padding:24px" class="stack gap16">
    <h1 class="display" style="margin:0">Game master</h1>
    <label class="field">Host PIN<input type="password" inputmode="numeric" value=${v} onInput=${e => setV(e.target.value)} autofocus /></label>
    ${err && html`<div class="note warn" role="alert">${err}</div>`}
    <button class="btn primary">Enter console</button></form>`;
}

function Console({ state, now, toast }) {
  const game = state.game || {};
  const phase = phaseOf(state);
  const scenario = state.hidden?.scenario;
  const left = remainingMs(game.timer, now);
  const running = !!game.timer?.running;
  const [override, setOverride] = useState(null);
  const lockingRef = useRef(false);

  const upd = (path, value) => store.update(path, value).catch(e => toast(e.message));

  const setTimer = (secs, run) => upd('game', { timer: run ? { running: true, endsAt: store.now() + secs * 1000, remaining: secs * 1000, total: secs * 1000 } : { running: false, remaining: secs * 1000, total: secs * 1000 } });
  const startPause = () => {
    if (running) upd('game', { 'timer/running': false, 'timer/remaining': left, 'timer/endsAt': null });
    else upd('game', { 'timer/running': true, 'timer/endsAt': store.now() + left });
  };
  const addTime = ms => running
    ? upd('game', { 'timer/endsAt': (game.timer.endsAt || store.now()) + ms })
    : upd('game', { 'timer/remaining': Math.max(0, left + ms) });

  async function lockRound(round) {
    if (state.game?.locked?.[round] || lockingRef.current) return;
    lockingRef.current = true;
    const u = { [`game/locked/${round}`]: true, 'game/timer/running': false, 'game/timer/remaining': 0, 'game/timer/endsAt': null };
    const missing = [];
    for (const id of TEAM_IDS) {
      const t = state.teams?.[id] || {};
      if (t[round]) continue;
      if (t.draft?.round === round && isValid(t.draft.alloc, t.draft.reasons)) {
        u[`teams/${id}/${round}`] = { alloc: cleanAlloc(t.draft.alloc), reasons: t.draft.reasons || {}, at: store.now(), auto: true };
      } else if (round === 'r1') missing.push(id);
    }
    await store.update('', u).catch(e => toast(e.message));
    lockingRef.current = false;
    toast(missing.length ? `Locked. No valid Round 1 entry from Team ${missing.join(', ')}. Use Override.` : `${round === 'r1' ? 'Round 1' : 'Round 2'} locked.`);
  }

  // Lock automatically when the round timer reaches zero.
  useEffect(() => {
    if ((phase === 'r1' || phase === 'r2') && running && left <= 0) lockRound(phase);
  }, [left <= 0, phase, running]);

  const sendEvents = () => {
    if (!scenario) return toast('Load the scenario first.');
    const u = {}; const at = store.now();
    for (const id of TEAM_IDS) if (scenario.lifeEvents?.[id]) u[`teams/${id}/inbox/event`] = { text: scenario.lifeEvents[id], at };
    u['game/flags/events'] = true;
    upd('', u);
  };
  const sendRumours = () => {
    if (!scenario) return toast('Load the scenario first.');
    const u = {}; const at = store.now();
    for (const r of scenario.rumours || []) u[`teams/${r.team}/inbox/rumour`] = { text: r.text, at };
    u['game/flags/rumours'] = true;
    upd('', u);
  };

  async function goPhase(id) {
    if (id === phase) return;
    const from = phase;
    if ((from === 'r1' || from === 'r2') && !state.game?.locked?.[from] && phaseIdx(id) > phaseIdx(from)) await lockRound(from);
    const u = { 'game/phase': id };
    const secs = secsFor(id);
    u['game/timer'] = secs ? { running: ['brief', 'r1', 'shock', 'r2'].includes(id), endsAt: ['brief', 'r1', 'shock', 'r2'].includes(id) ? store.now() + secs * 1000 : null, remaining: secs * 1000, total: secs * 1000 } : null;
    if (id === 'r1' || id === 'r2') u[`game/locked/${id}`] = null;
    if (id === 'shock' || id === 'r2') {
      if (!scenario) { toast('Load the scenario first.'); return; }
      u['public/news'] = { headline: scenario.headline, subhead: scenario.subhead || '' };
    }
    if (id === 'r2' && !state.game?.flags?.events && scenario) {
      const at = store.now();
      for (const t of TEAM_IDS) if (scenario.lifeEvents?.[t]) u[`teams/${t}/inbox/event`] = { text: scenario.lifeEvents[t], at };
      u['game/flags/events'] = true;
    }
    if (id === 'reveal') {
      if (!scenario) { toast('Load the scenario first.'); return; }
      u['public/returns'] = { period: scenario.period, r1: scenario.r1, r2: scenario.r2, bonus: scenario.bonus || {}, sample: !!scenario.sample };
      u['game/revealStep'] = 0;
    }
    if (id === 'pitch') { u['game/pitchTeam'] = 1; u['game/timer'] = { running: false, remaining: 60000, total: 60000 }; }
    await store.update('', u).catch(e => toast(e.message));
  }

  const loadScenario = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      const missing = ['headline', 'r1', 'r2', 'lifeEvents'].filter(k => !s[k]);
      if (missing.length) return toast('Scenario is missing: ' + missing.join(', '));
      await store.set('hidden/scenario', s);
      toast(s.sample ? 'Sample scenario loaded. Replace with real returns before the event.' : 'Scenario loaded.');
    } catch (err) { toast('Could not read that file: ' + err.message); }
    e.target.value = '';
  };

  const resetGame = async () => {
    if (!confirm('Reset the whole game? Teams stay joined, but all portfolios, scores and phases are cleared.')) return;
    await store.update('', { teams: null, scores: null, public: null, game: { phase: 'lobby', settings: game.settings || { fee: false } } }).catch(e => toast(e.message));
    toast('Game reset.');
  };

  const exportCsv = () => {
    const rows = leaderboard(state);
    const lines = [['Team', 'Client', ...ASSETS.map(a => 'R1 ' + a.id), ...ASSETS.map(a => 'R2 ' + a.id), 'Value', 'Return', 'Return pts', 'Mandate pts', 'Pitch pts', 'Total'].join(',')];
    for (const r of rows) {
      const t = state.teams?.[r.id] || {};
      const a1 = cleanAlloc(t.r1?.alloc || {}), a2 = cleanAlloc(t.r2?.alloc || t.r1?.alloc || {});
      lines.push([r.id, r.client.name, ...ASSETS.map(a => a1[a.id]), ...ASSETS.map(a => a2[a.id]), r.p ? Math.round(r.p.v2) : '', r.p ? (r.p.twr * 100).toFixed(2) + '%' : '', r.returnPts, r.mandatePts, r.pitch.points, r.total].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fund-manager-results.csv'; a.click();
  };

  const members = Object.values(state.members || {});
  const round = phase === 'r1' || phase === 'r2' ? phase : null;
  const current = phaseIdx(phase);
  const submitted = round ? TEAM_IDS.filter(id => state.teams?.[id]?.[round]).length : 0;

  return html`
  <div class="console">
    <nav aria-label="Game phases">
      <span class="brand">Game master</span>
      ${PHASES.map((p, i) => html`<button class=${'phase-btn' + (i < current ? ' done' : '') + (i === current ? ' current' : '')} aria-current=${i === current ? 'step' : null} onClick=${() => goPhase(p.id)}>${i < current ? '✓ ' : ''}${p.label}</button>`)}
      <div style="margin-top:auto;padding:12px 10px;font-size:12px;color:var(--muted-dark);line-height:1.6" class="stack gap8">
        <a href="screen.html" target="_blank" style="color:var(--blue-light)">Open big screen ↗</a>
        <a href="judge.html" target="_blank" style="color:var(--blue-light)">Open judge view ↗</a>
        <span>${members.length} phones joined · ${Object.keys(state.judges || {}).length} judges</span>
      </div>
    </nav>
    <main>
      ${!scenario ? html`<div class="banner warn row between wrap gap12"><span><b>No scenario loaded.</b> Load scenario.json before Breaking news.</span><label class="btn sm">Load scenario<input type="file" accept="application/json,.json" style="display:none" onChange=${loadScenario} /></label></div>`
        : scenario.sample ? html`<div class="banner warn row between wrap gap12"><span><b>Sample returns loaded.</b> Swap in the real, verified returns before the event.</span><label class="btn sm">Replace scenario<input type="file" accept="application/json,.json" style="display:none" onChange=${loadScenario} /></label></div>` : null}

      <div class="row between wrap gap16">
        <div class="stack gap4"><h1>${phaseLabel(phase)}</h1>
          <span class="muted" style="font-size:14px">${round ? `${submitted} of 6 teams submitted${state.game?.locked?.[round] ? ' · locked' : ' · auto-locks at 00:00'}` : phase === 'pitch' ? `Team ${game.pitchTeam} is pitching` : ''}</span></div>
        ${game.timer ? html`<div class="row gap8 wrap">
          <span class="host-clock">${fmtClock(left)}</span>
          <button class="btn sm" onClick=${startPause}>${running ? 'Pause' : 'Start'}</button>
          <button class="btn sm" onClick=${() => addTime(60000)}>+1 min</button>
          <button class="btn sm" onClick=${() => addTime(-30000)}>−30 s</button>
          ${round ? html`<button class="btn sm dark" disabled=${state.game?.locked?.[round]} onClick=${() => lockRound(round)}>Lock round now</button>` : null}
        </div>` : null}
      </div>

      ${(phase === 'shock' || phase === 'r2') ? html`<section class="card row wrap gap12" aria-label="Push to teams">
        <span class="eyebrow" style="margin-right:6px">Push</span>
        <button class=${'btn sm ' + (game.flags?.events ? 'done' : 'primary')} onClick=${sendEvents}>${game.flags?.events ? 'Life events sent · resend' : 'Send life events (6)'}</button>
        <button class=${'btn sm ' + (game.flags?.rumours ? 'done' : 'amber')} onClick=${sendRumours}>${game.flags?.rumours ? 'Rumours sent · resend' : `Send rumour tips (${(scenario?.rumours || []).length})`}</button>
        ${(scenario?.rumours || []).map(r => html`<span class="pill grey">Team ${r.team}: ${r.truth === 'true' ? 'true tip' : 'false tip'}</span>`)}
      </section>` : null}

      ${phase === 'reveal' ? html`<section class="card row wrap gap12" aria-label="Reveal">
        <span class="eyebrow" style="margin-right:6px">Reveal on screen</span>
        ${['Hidden period', 'Asset returns', 'Portfolio results'].map((label, i) => html`<button class=${'btn sm ' + ((game.revealStep || 0) > i ? 'done' : (game.revealStep || 0) === i ? 'primary' : '')} onClick=${() => upd('game', { revealStep: i + 1 })}>${i + 1}. ${label}</button>`)}
      </section>` : null}

      ${phase === 'pitch' ? html`<section class="card stack gap12" aria-label="Pitches">
        <div class="row wrap gap8"><span class="eyebrow" style="margin-right:6px">Now pitching</span>
          ${TEAM_IDS.map(id => html`<button class=${'btn sm ' + (game.pitchTeam === id ? 'primary' : '')} onClick=${() => upd('game', { pitchTeam: id, timer: { running: false, remaining: 60000, total: 60000 } })}>Team ${id}</button>`)}
          <button class="btn sm dark" onClick=${() => setTimer(60, true)}>Start 60 s</button>
          <button class="btn sm" disabled=${game.pitchTeam >= 6} onClick=${() => upd('game', { pitchTeam: (game.pitchTeam || 0) + 1, timer: { running: false, remaining: 60000, total: 60000 } })}>Next team →</button></div>
        <div class="row wrap gap8">${TEAM_IDS.map(id => {
          const n = JUDGE_IDS.filter(j => state.scores?.[j]?.[id]).length;
          return html`<span class=${'pill ' + (n === 3 ? 'ok' : n ? 'warn' : 'grey')}>Team ${id}: ${n}/3 judges</span>`;
        })}</div>
      </section>` : null}

      ${phase === 'lobby' || phase === 'brief' ? html`<section class="card row wrap gap16 between">
        <label class="row gap8" style="font-size:14px"><input type="checkbox" checked=${!!game.settings?.fee} onChange=${e => upd('game', { 'settings/fee': e.target.checked })} style="width:20px;height:20px" /> Switching fee in Round 2 (0.5% of money moved)</label>
        <span class="muted" style="font-size:13px">Team codes are on each card below. Give each code only to that table.</span>
      </section>` : null}

      ${(phase === 'reveal' || phase === 'pitch' || phase === 'final') ? html`<${Board} state=${state} />` : null}

      <section class="team-grid" aria-label="Teams">
        ${TEAM_IDS.map(id => html`<${TeamCard} id=${id} state=${state} round=${round} onOverride=${() => setOverride(id)} />`)}
      </section>

      <div class="row wrap gap12 between" style="border-top:1px solid var(--line);padding-top:16px">
        <span class="muted" style="font-size:13px">Backup: export everything to a spreadsheet at any time.</span>
        <div class="row wrap gap8">
          <button class="btn sm" onClick=${exportCsv}>Export CSV</button>
          <label class="btn sm" style="display:inline-flex;align-items:center">Load scenario<input type="file" accept="application/json,.json" style="display:none" onChange=${loadScenario} /></label>
          <button class="btn sm" onClick=${resetGame}>Reset game</button>
          ${current < PHASES.length - 1 ? html`<button class="btn sm primary" onClick=${() => goPhase(PHASES[current + 1].id)}>Next: ${PHASES[current + 1].label} →</button>` : null}
        </div>
      </div>
    </main>
    ${override ? html`<${Override} id=${override} state=${state} round=${round || (state.teams?.[override]?.r2 ? 'r2' : 'r1')} onClose=${() => setOverride(null)} toast=${toast} />` : null}
  </div>`;
}

function TeamCard({ id, state, round, onOverride }) {
  const t = state.teams?.[id] || {};
  const phones = Object.values(state.members || {}).filter(m => String(m.team) === String(id)).length;
  const code = state.secrets?.teams?.[id];
  const showRound = round || (t.r2 ? 'r2' : 'r1');
  const entry = t[showRound];
  const draftLive = round && t.draft?.round === round ? t.draft : null;
  const alloc = cleanAlloc(entry?.alloc || draftLive?.alloc || (showRound === 'r2' ? t.r1?.alloc : null) || emptyAlloc());
  const rules = mandate(id, alloc);
  const top = ASSETS.filter(a => alloc[a.id]).sort((a, b) => alloc[b.id] - alloc[a.id]).slice(0, 4).map(a => `${a.short} ${alloc[a.id]}%`).join(' · ');
  const status = entry ? (entry.override ? ['ok', 'Overridden'] : entry.auto ? ['ok', 'Auto-submitted'] : ['ok', 'Submitted'])
    : draftLive ? [isValid(draftLive.alloc, draftLive.reasons) ? 'warn' : 'grey', `Editing · ${total(draftLive.alloc)}%`]
    : round ? ['bad', 'No entry'] : null;
  return html`<div class="card stack gap8">
    <div class="row between"><b style="font-size:16px">Team ${id}</b>${status ? html`<span class=${'pill ' + status[0]}>${status[1]}</span>` : null}</div>
    <span class="muted" style="font-size:13px">${CLIENTS[id].name} · ${phones} phone${phones === 1 ? '' : 's'} · code <b class="mono" style="color:var(--ink)">${code ?? '—'}</b></span>
    <span style="font-size:13px;min-height:18px">${top || html`<span class="muted">No allocation yet</span>`}</span>
    <span class="muted" style="font-size:12px">Rules met: ${rules.filter(r => r.ok).length} of 3${t.inbox?.rumour ? ' · got rumour' : ''}</span>
    <button class="btn sm" style="align-self:flex-start" onClick=${onOverride}>Override entry</button>
  </div>`;
}

function Override({ id, state, round, onClose, toast }) {
  const t = state.teams?.[id] || {};
  const start = cleanAlloc(t[round]?.alloc || (t.draft?.round === round ? t.draft.alloc : null) || (round === 'r2' ? t.r1?.alloc : null) || emptyAlloc());
  const [alloc, setAlloc] = useState(start);
  const sum = total(alloc);
  const save = async () => {
    if (sum !== 100) return toast('The total must be exactly 100%.');
    try {
      await store.set(`teams/${id}/${round}`, { alloc: cleanAlloc(alloc), reasons: t[round]?.reasons || t.draft?.reasons || {}, at: store.now(), override: true });
      toast(`Team ${id} ${round === 'r1' ? 'Round 1' : 'Round 2'} saved.`); onClose();
    } catch (e) { toast(e.message); }
  };
  return html`<div class="modal" role="dialog" aria-modal="true" aria-label="Override entry"><div class="card">
    <div class="row between"><h2 class="display" style="margin:0;font-size:20px">Team ${id} · ${round === 'r1' ? 'Round 1' : 'Round 2'}</h2><button class="btn sm" onClick=${onClose}>Close</button></div>
    <span class="muted" style="font-size:13px">Type the team's allocation as they tell you. Total must be 100%.</span>
    <div class="alloc-edit">${ASSETS.map(a => html`<label for=${'ov-' + a.id}>${a.name}</label><input id=${'ov-' + a.id} inputmode="numeric" value=${alloc[a.id]} onInput=${e => setAlloc({ ...alloc, [a.id]: Math.max(0, Number(e.target.value) || 0) })} />`)}</div>
    <div class=${'note ' + (sum === 100 ? 'ok' : 'warn')}>Total: ${sum}%</div>
    <button class="btn primary" onClick=${save}>Save entry</button>
  </div></div>`;
}

function Board({ state }) {
  const rows = leaderboard(state);
  return html`<section class="card stack gap8" aria-label="Scores"><span class="eyebrow">Live scores (host view)</span>
    <table class="mini"><thead><tr><th>Team</th><th>Client</th><th class="r">Value</th><th class="r">Return</th><th class="r">Ret pts</th><th class="r">Mandate</th><th class="r">Pitch</th><th class="r">Total</th></tr></thead>
    <tbody>${rows.map(r => html`<tr><td>${r.id}</td><td>${r.client.name}</td><td class="r">${r.p ? fmtMoney(r.p.v2) : '—'}</td><td class="r">${r.p ? fmtPct(r.p.twr) : '—'}</td><td class="r">${r.returnPts}</td><td class="r">${r.mandatePts}</td><td class="r">${r.pitch.points} (${r.pitch.judges}/3)</td><td class="r"><b>${r.total}</b></td></tr>`)}</tbody></table>
  </section>`;
}

render(html`<${App} />`, document.getElementById('app'));
