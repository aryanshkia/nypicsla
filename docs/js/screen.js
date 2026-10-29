// Big screen (screen.html). Read-only: it only displays the shared state.
import { html, render } from '../vendor/preact-htm.js';
import qrcode from '../vendor/qrcode.mjs';
import { PUBLIC_PATHS } from './store.js';
import { ASSETS, CLIENTS, TEAM_IDS, JUDGE_IDS, ROLES } from './config.js';
import { leaderboard, fmtClock, fmtMoney, fmtPct } from './game.js';
import { useGame, phaseOf, phaseLabel, timerLeft, Loading } from './ui.js';

const joinUrl = (() => {
  const base = location.href.replace(/screen\.html.*$/, '');
  const q = new URLSearchParams(location.search).get('backend');
  return base + (q ? `?backend=${q}` : '');
})();
const qrSrc = (() => { const q = qrcode(0, 'M'); q.addData(joinUrl); q.make(); return q.createDataURL(8, 2); })();

function App() {
  const { state, now, error } = useGame(PUBLIC_PATHS);
  if (!state) return html`<${Loading} error=${error} />`;
  const phase = phaseOf(state);
  const left = timerLeft(state, now);
  const showClock = state.game?.timer && ['brief', 'r1', 'r2', 'pitch', 'shock'].includes(phase);
  if (phase === 'shock') return html`<${News} state=${state} left=${left} />`;
  return html`<div class="screen">
    <div class="screen-top"><span class="screen-brand">Fund Manager for Hire</span>
      ${showClock ? html`<span class=${'screen-clock' + (left < 60000 ? ' low' : '')}>${fmtClock(left)}</span>` : html`<span class="eyebrow">${phaseLabel(phase)}</span>`}</div>
    <main class="screen-main">
      ${(phase === 'lobby' || phase === 'brief') && html`<${Lobby} state=${state} phase=${phase} />`}
      ${(phase === 'r1' || phase === 'r2') && html`<${Round} state=${state} round=${phase} />`}
      ${phase === 'reveal' && html`<${Reveal} state=${state} />`}
      ${phase === 'pitch' && html`<${Pitch} state=${state} />`}
      ${phase === 'final' && html`<${Final} state=${state} />`}
    </main>
  </div>`;
}

function Lobby({ state, phase }) {
  return html`
    <div class="row gap24" style="align-items:center;flex:1">
      <div class="stack gap16 grow">
        <span class="eyebrow">${phase === 'lobby' ? 'Get ready' : 'Meet your client'}</span>
        <h1>${phase === 'lobby' ? 'Scan to join your team' : 'You are now a fund manager'}</h1>
        <p class="lead">${phase === 'lobby' ? 'One phone per person. Your marshal will give your table its team code.' : 'Each team has one client with different needs. Read the client card on your phone and pick your roles.'}</p>
        <span class="mono" style="font-size:clamp(14px,1.4vw,24px);color:var(--soft-dark)">${joinUrl}</span>
      </div>
      <div class="qr"><img src=${qrSrc} alt="QR code to join the game" /></div>
    </div>
    <div class="tiles">${TEAM_IDS.map(id => {
      const roles = Object.keys(state.teams?.[id]?.roles || {}).length;
      return html`<div class=${'tile' + (roles ? ' ok' : '')}><span class="t">Team ${id}</span><span class="s">${phase === 'brief' ? CLIENTS[id].name : `${roles} of ${ROLES.length} roles taken`}</span></div>`;
    })}</div>`;
}

function Round({ state, round }) {
  const locked = state.game?.locked?.[round];
  return html`
    <span class="eyebrow">${round === 'r1' ? 'Round 1 of 2' : 'Round 2 of 2'}</span>
    <h1>${round === 'r1' ? 'Build a portfolio for your client' : 'Hold, sell or shift?'}</h1>
    <p class="lead">${locked ? 'Time is up. Allocations are locked.' : round === 'r1' ? 'Fully allocate $10,000. No holding above 40%. Every pick needs a reason.' : 'React to the news and to your client’s call. Not resubmitting keeps your Round 1 portfolio.'}</p>
    <div class="tiles" style="margin-top:auto">${TEAM_IDS.map(id => {
      const t = state.teams?.[id] || {};
      const done = !!t[round];
      const editing = t.draft?.round === round;
      return html`<div class=${'tile' + (done ? ' ok' : '')}><span class="t">Team ${id}</span><span class="s">${CLIENTS[id].name}</span><span class="s">${done ? 'Submitted ✓' : editing ? 'Working…' : 'Waiting'}</span></div>`;
    })}</div>`;
}

function News({ state, left }) {
  const news = state.public?.news || { headline: '…' };
  return html`<div class="screen">
    <div class="screen-top"><span class="screen-brand">Fund Manager for Hire</span>
      <div class="row gap16"><span class="eyebrow">Round 2 starts in</span><span class="screen-clock">${fmtClock(left)}</span></div></div>
    <div class="breaking"><b>BREAKING NEWS</b><span style="width:12px;height:12px;border-radius:50%;background:#B42318"></span><span style="font-size:clamp(14px,1.4vw,24px);font-weight:600">Live from the trading floor</span></div>
    <main class="screen-main" style="padding-top:5vh">
      <h1 style="max-width:85vw">${news.headline}</h1>
      ${news.subhead ? html`<p class="lead">${news.subhead}</p>` : null}
      <div class="stack gap12" style="margin-top:auto"><span class="eyebrow">Check your phones: your client is calling</span></div>
    </main>
    <div class="ticker">${ASSETS.filter(a => a.id !== 'CASH').map(a => html`<span>${a.id}</span>`)}<span style="margin-left:auto;font-family:var(--body);font-size:.75em;color:var(--muted-dark)">Real returns revealed at the end</span></div>
  </div>`;
}

function Reveal({ state }) {
  const step = state.game?.revealStep || 0;
  const r = state.public?.returns;
  if (!r || step === 0) return html`<span class="eyebrow">Returns reveal</span><h1>The market has spoken…</h1><p class="lead">Let's see what really happened.</p>`;
  const full = id => (1 + (Number(r.r1?.[id]) || 0)) * (1 + (Number(r.r2?.[id]) || 0)) - 1;
  return html`
    <div class="row between wrap gap16"><div class="stack gap8"><span class="eyebrow">The hidden period was</span><h1 style="color:var(--amber)">${r.period}</h1></div>
      ${r.sample ? html`<span class="eyebrow" style="color:var(--amber)">Sample returns</span>` : null}</div>
    ${step >= 2 && step < 3 ? html`<div class="ret-grid">${ASSETS.filter(a => a.id !== 'CASH').map(a => {
      const x = full(a.id);
      return html`<div class="ret"><span><b>${a.short}</b><span style="display:block;font-size:.65em;color:var(--muted-dark)">before shock ${fmtPct(Number(r.r1?.[a.id]) || 0)} · after ${fmtPct(Number(r.r2?.[a.id]) || 0)}</span></span><span class=${'mono ' + (x >= 0 ? 'up' : 'down')}>${x >= 0 ? '▲' : '▼'} ${fmtPct(x)}</span></div>`;
    })}</div>` : null}
    ${step >= 3 ? html`<${Portfolios} state=${state} />` : null}`;
}

function Portfolios({ state }) {
  const rows = leaderboard(state).filter(r => r.p).sort((a, b) => b.p.twr - a.p.twr);
  return html`<div class="board">
    <div class="board-row head"><span>Rank</span><span>Team · Client</span><span class="r">Value</span><span class="r">Return</span><span class="r">Return pts</span><span></span><span></span></div>
    ${rows.map((r, i) => html`<div class="board-row"><span class="rank">${i + 1}</span><span>Team ${r.id}<span class="sub">${r.client.name}</span></span><span class="r">${fmtMoney(r.p.v2)}</span><span class=${'r ' + (r.p.twr >= 0 ? 'up' : 'down')}>${fmtPct(r.p.twr)}</span><span class="r">${r.returnPts}</span><span></span><span></span></div>`)}
  </div>`;
}

function Pitch({ state }) {
  const id = state.game?.pitchTeam || 1;
  const c = CLIENTS[id];
  const judged = JUDGE_IDS.filter(j => state.scores?.[j]?.[id]).length;
  return html`
    <span class="eyebrow">Investment committee pitch · ${id} of 6</span>
    <h1>Team ${id}, pitch to ${c.name}</h1>
    <p class="lead">${c.name}, ${c.age}. ${c.blurb}. Why does your portfolio fit, and how did you handle their call?</p>
    <div class="tiles" style="margin-top:auto">${TEAM_IDS.map(t => {
      const n = JUDGE_IDS.filter(j => state.scores?.[j]?.[t]).length;
      return html`<div class=${'tile' + (n === 3 ? ' ok' : '')} style=${t === id ? 'border-color:var(--amber)' : ''}><span class="t">Team ${t}</span><span class="s">${t === id ? `Judges ${judged}/3` : n === 3 ? 'Scored ✓' : 'Up soon'}</span></div>`;
    })}</div>`;
}

function Final({ state }) {
  const rows = leaderboard(state);
  const best = rows.filter(r => r.p).sort((a, b) => b.p.twr - a.p.twr)[0];
  const winner = rows[0];
  return html`
    <div class="row between"><div class="stack gap8"><span class="eyebrow">Final results</span><h1>Who gets hired?</h1></div>
      ${state.public?.returns ? html`<div class="stack gap4" style="align-items:flex-end"><span class="eyebrow">The hidden period was</span><span class="display" style="font-size:clamp(20px,2vw,36px);font-weight:700;color:var(--amber)">${state.public.returns.period}</span></div>` : null}</div>
    <div class="board">
      <div class="board-row head"><span>Rank</span><span>Team · Client</span><span class="r">Portfolio</span><span class="r">Return /40</span><span class="r">Mandate /30</span><span class="r">Pitch /30</span><span class="r">Total</span></div>
      ${rows.map((r, i) => html`<div class=${'board-row' + (i === 0 ? ' win' : '')}><span class="rank">${i + 1}</span><span>Team ${r.id}${i === 0 ? ' · Hired!' : ''}<span class="sub">Client: ${r.client.name}</span></span><span class="r">${r.p ? fmtMoney(r.p.v2) : '—'}</span><span class="r">${r.returnPts}</span><span class="r">${r.mandatePts}</span><span class="r">${r.pitch.points}</span><span class="r"><b>${r.total}</b></span></div>`)}
    </div>
    ${best && winner && best.id !== winner.id ? html`<p class="lead" style="color:#F5C46B;margin-top:auto">Team ${best.id} had the best return but didn't win. Fitting the client matters as much as the number.</p>` : null}`;
}

render(html`<${App} />`, document.getElementById('app'));
