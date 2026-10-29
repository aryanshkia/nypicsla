// Pure game logic: validation, mandate checks, portfolio maths and scoring.
// No DOM and no database here, so it runs the same in the browser and in tests.
import {
  ASSETS, CLIENTS, TEAM_IDS, CAPITAL, MAX_HOLDING_PCT, STEP_PCT,
  RETURN_POINTS, SWITCHING_FEE, PITCH_CRITERIA,
} from './config.js';

const byId = Object.fromEntries(ASSETS.map(a => [a.id, a]));

export const emptyAlloc = () => Object.fromEntries(ASSETS.map(a => [a.id, 0]));

export function cleanAlloc(alloc) {
  const out = emptyAlloc();
  for (const a of ASSETS) out[a.id] = Math.max(0, Math.round(Number(alloc?.[a.id]) || 0));
  return out;
}

export const total = alloc => ASSETS.reduce((s, a) => s + (Number(alloc?.[a.id]) || 0), 0);

export const held = alloc => ASSETS.filter(a => (Number(alloc?.[a.id]) || 0) > 0);

export const holdingsCount = alloc => held(alloc).filter(a => a.id !== 'CASH').length;

const pctIn = (alloc, tags) =>
  ASSETS.filter(a => a.tags.some(t => tags.includes(t))).reduce((s, a) => s + (alloc[a.id] || 0), 0);

export function checkRule(rule, alloc) {
  switch (rule.type) {
    case 'minPct': return pctIn(alloc, rule.tags) >= rule.pct;
    case 'maxPct': return pctIn(alloc, rule.tags) <= rule.pct;
    case 'maxSingleStock':
      return ASSETS.filter(a => a.tags.includes('stock')).every(a => (alloc[a.id] || 0) <= rule.pct);
    case 'minHoldings': return holdingsCount(alloc) >= rule.n;
    case 'minCount':
      return ASSETS.filter(a => a.tags.includes(rule.tag) && (alloc[a.id] || 0) > 0).length >= rule.n;
    case 'maxSector': {
      const sectors = {};
      for (const a of ASSETS) if (a.id !== 'CASH') sectors[a.sector] = (sectors[a.sector] || 0) + (alloc[a.id] || 0);
      return Object.values(sectors).every(v => v <= rule.pct);
    }
    default: return false;
  }
}

export const mandate = (teamId, alloc) =>
  CLIENTS[teamId].rules.map(r => ({ label: r.label, ok: checkRule(r, cleanAlloc(alloc)) }));

// Problems that block submission (the game rules, not the client's mandate).
export function blockers(alloc, reasons) {
  const a = cleanAlloc(alloc);
  const out = [];
  const t = total(a);
  if (t < 100) out.push(`Allocate the last ${100 - t}% to submit.`);
  if (t > 100) out.push(`You're over by ${t - 100}%. Take some out.`);
  const over = ASSETS.filter(x => a[x.id] > MAX_HOLDING_PCT);
  if (over.length) out.push(`No single holding can go above ${MAX_HOLDING_PCT}% (${over.map(x => x.short).join(', ')}).`);
  const bad = ASSETS.filter(x => a[x.id] % STEP_PCT !== 0);
  if (bad.length) out.push(`Use steps of ${STEP_PCT}%.`);
  const missing = held(a).filter(x => !String(reasons?.[x.id] || '').trim());
  if (missing.length) out.push(`Add a one-line reason for ${missing.map(x => x.short).join(', ')}.`);
  return out;
}

export const isValid = (alloc, reasons) => blockers(alloc, reasons).length === 0;

// Portfolio maths. returns = { r1: {ID: 0.05}, r2: {...}, bonus: {6: 2000} }
export function portfolio(teamId, team, returns, settings = {}) {
  const w = team?.r1?.alloc ? cleanAlloc(team.r1.alloc) : null;
  if (!w || !returns) return null;
  const v = team?.r2?.alloc ? cleanAlloc(team.r2.alloc) : w;
  const leg = (alloc, r) => ASSETS.reduce((s, a) => s + (alloc[a.id] / 100) * (1 + (Number(r?.[a.id]) || 0)), 0);
  const v1 = CAPITAL * leg(w, returns.r1);
  const moved = ASSETS.reduce((s, a) => s + Math.abs(v[a.id] - w[a.id]), 0) / 200; // share of the portfolio moved
  const fee = settings.fee ? SWITCHING_FEE * v1 * moved : 0;
  const bonus = Number(returns.bonus?.[teamId]) || 0;
  const start2 = v1 - fee + bonus;
  const v2 = start2 * leg(v, returns.r2);
  const twr = (v1 / CAPITAL) * (v2 / (v1 + bonus)) - 1; // time-weighted, so a bonus doesn't count as profit
  return { v1, v2, fee, bonus, twr, moved };
}

export function pitchScore(teamId, scores) {
  const totals = [];
  for (const judge of Object.values(scores || {})) {
    const s = judge?.[teamId];
    if (s && PITCH_CRITERIA.every(c => Number(s[c.id]) >= 1)) {
      totals.push(PITCH_CRITERIA.reduce((acc, c) => acc + Number(s[c.id]), 0));
    }
  }
  if (!totals.length) return { points: 0, judges: 0 };
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  return { points: Math.round((avg / (PITCH_CRITERIA.length * 5)) * 30 * 10) / 10, judges: totals.length };
}

export function leaderboard(state) {
  const returns = state?.public?.returns;
  const settings = state?.game?.settings || {};
  const rows = TEAM_IDS.map(id => {
    const team = state?.teams?.[id];
    const p = portfolio(id, team, returns, settings);
    const finalAlloc = team?.r2?.alloc || team?.r1?.alloc;
    const m = finalAlloc ? mandate(id, finalAlloc) : CLIENTS[id].rules.map(r => ({ label: r.label, ok: false }));
    const pitch = pitchScore(id, state?.scores);
    return { id, client: CLIENTS[id], p, mandate: m, mandatePts: 10 * m.filter(x => x.ok).length, pitch };
  });
  // Return points by rank; tied returns share the higher points.
  const ranked = rows.filter(r => r.p).sort((a, b) => b.p.twr - a.p.twr);
  ranked.forEach((r, i) => {
    const first = ranked.findIndex(x => Math.abs(x.p.twr - r.p.twr) < 1e-9);
    r.returnRank = first + 1;
    r.returnPts = RETURN_POINTS[first] ?? 0;
  });
  for (const r of rows) {
    if (!r.p) { r.returnPts = 0; r.returnRank = null; }
    r.total = Math.round((r.returnPts + r.mandatePts + r.pitch.points) * 10) / 10;
  }
  return rows.sort((a, b) => b.total - a.total || b.mandatePts - a.mandatePts || b.pitch.points - a.pitch.points);
}

export function remainingMs(timer, now) {
  if (!timer) return 0;
  if (timer.running && timer.endsAt) return Math.max(0, timer.endsAt - now);
  return Math.max(0, Number(timer.remaining) || 0);
}

export const fmtClock = ms => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-SG');
export const fmtPct = (x, dp = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`;
export const asset = id => byId[id];
