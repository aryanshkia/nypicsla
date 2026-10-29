// Public game configuration. Nothing in this file is secret.
// Real returns, the hidden period, the headline, life events and rumours live in
// scenario.json, which is loaded into the host-only part of the database.

export const CAPITAL = 10000;
export const MAX_HOLDING_PCT = 40; // diversification cap (Variation 1)
export const STEP_PCT = 5;         // +/- buttons move allocations by this much

// Which backend to use. 'local' = the dev server in server.js.
// 'firebase' = Firebase Realtime Database (fill in FIREBASE below).
// Change DEFAULT_BACKEND to 'firebase' when you deploy. ?backend=local overrides it.
const DEFAULT_BACKEND = 'firebase';
export const BACKEND = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('backend')) || DEFAULT_BACKEND;

export const FIREBASE = {
  apiKey: 'AIzaSyDhaZ7wDBkIVvHV-Rp8aQHIWhKS6NDMvrw',
  authDomain: 'nypic-sla.firebaseapp.com',
  databaseURL: 'https://nypic-sla-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'nypic-sla',
};

// Phase order and default timer lengths (seconds).
export const PHASES = [
  { id: 'lobby',  label: 'Lobby',                  secs: 0 },
  { id: 'brief',  label: 'Brief and client reveal', secs: 300 },
  { id: 'r1',     label: 'Round 1: build',          secs: 480 },
  { id: 'shock',  label: 'Breaking news',           secs: 120 },
  { id: 'r2',     label: 'Round 2: adjust',         secs: 420 },
  { id: 'reveal', label: 'Returns reveal',          secs: 180 },
  { id: 'pitch',  label: 'Pitches',                 secs: 60 },
  { id: 'final',  label: 'Final scores',            secs: 0 },
];

// Tags drive the mandate rules.
//   stock = a single company's shares, equity = any stock-like holding
export const ASSETS = [
  { id: 'D05',  name: 'DBS Group',                      short: 'DBS',    type: 'Bank stock',    sector: 'Banks',       tags: ['stock', 'equity', 'income'] },
  { id: 'C6L',  name: 'Singapore Airlines',             short: 'SIA',    type: 'Airline stock', sector: 'Airlines',    tags: ['stock', 'equity'] },
  { id: 'C38U', name: 'CapitaLand Integrated Comm. Trust', short: 'CICT', type: 'REIT',          sector: 'Real estate', tags: ['equity', 'income', 'reit'] },
  { id: 'ES3',  name: 'SPDR STI ETF',                   short: 'STI ETF', type: 'Index ETF',    sector: 'SG index',    tags: ['equity', 'income', 'etf'] },
  { id: 'A35',  name: 'ABF Singapore Bond Index Fund',  short: 'Bonds',  type: 'Bond ETF',      sector: 'Bonds',       tags: ['bond', 'income', 'defensive', 'etf'] },
  { id: 'O87',  name: 'SPDR Gold Shares',               short: 'Gold',   type: 'Gold ETF',      sector: 'Gold',        tags: ['gold', 'defensive', 'etf'] },
  { id: 'AAPL', name: 'Apple',                          short: 'Apple',  type: 'US tech stock', sector: 'US tech',     tags: ['stock', 'equity', 'usTech'] },
  { id: 'NVDA', name: 'NVIDIA',                         short: 'NVIDIA', type: 'US tech stock', sector: 'US tech',     tags: ['stock', 'equity', 'usTech'] },
  { id: 'CASH', name: 'Cash',                           short: 'Cash',   type: 'Cash, 0% return', sector: 'Cash',      tags: ['cash', 'defensive'] },
];

// Rule types: minPct, maxPct (tags), maxSingleStock, minHoldings, minCount (tag), maxSector
export const CLIENTS = {
  1: { name: 'Madam Tan', age: 62, initial: 'T', blurb: 'Retiring next year', profile: ['Conservative', 'Needs income'],
       quote: 'This is my retirement money. I need it to pay me something and not disappear.',
       rules: [
         { type: 'minPct', tags: ['bond', 'gold'], pct: 40, label: 'At least 40% in bonds or gold' },
         { type: 'maxSingleStock', pct: 15, label: 'No single stock above 15%' },
         { type: 'minCount', tag: 'income', n: 2, label: 'At least 2 income assets' },
       ] },
  2: { name: 'Uncle Raj', age: 50, initial: 'R', blurb: 'Hawker who wants steady dividends', profile: ['Income-focused'],
       quote: 'I work 12 hours a day. I want my money to work too, and pay me regularly.',
       rules: [
         { type: 'minPct', tags: ['income'], pct: 50, label: 'At least 50% in dividend payers' },
         { type: 'minHoldings', n: 3, label: 'At least 3 holdings' },
         { type: 'maxPct', tags: ['usTech'], pct: 20, label: 'No more than 20% in US tech' },
       ] },
  3: { name: 'Daniel', age: 28, initial: 'D', blurb: 'Saving for a BTO downpayment in 3 years', profile: ['Moderate risk', 'Short horizon'],
       quote: "I can't afford to lose my downpayment. Some growth is nice, but I need this money to be there.",
       rules: [
         { type: 'minPct', tags: ['bond', 'gold'], pct: 30, label: 'At least 30% in bonds or gold' },
         { type: 'maxSingleStock', pct: 25, label: 'No single stock above 25%' },
         { type: 'minHoldings', n: 4, label: 'At least 4 holdings' },
       ] },
  4: { name: 'The Lims', age: 35, initial: 'L', blurb: "Saving for their child's university", profile: ['Balanced growth'],
       quote: 'We have 15 years. We want it to grow, but we lose sleep over big swings.',
       rules: [
         { type: 'minHoldings', n: 4, label: 'At least 4 holdings' },
         { type: 'maxSector', pct: 50, label: 'No more than 50% in one sector' },
         { type: 'minPct', tags: ['defensive'], pct: 20, label: 'At least 20% defensive (bonds, gold, cash)' },
       ] },
  5: { name: 'Jess', age: 19, initial: 'J', blurb: 'Poly student investing her savings', profile: ['Growth', 'Anxious'],
       quote: 'Everyone on TikTok is making money. I want in, but I get scared easily.',
       rules: [
         { type: 'minHoldings', n: 3, label: 'At least 3 holdings' },
         { type: 'maxSingleStock', pct: 30, label: 'No single stock above 30%' },
         { type: 'minPct', tags: ['defensive'], pct: 10, label: 'At least 10% defensive (bonds, gold, cash)' },
       ] },
  6: { name: 'Aisha', age: 22, initial: 'A', blurb: 'Fresh grad with a 30-year horizon', profile: ['Aggressive', 'Long horizon'],
       quote: "I'm young. I can ride out the dips. Go for growth.",
       rules: [
         { type: 'minPct', tags: ['equity'], pct: 60, label: 'At least 60% in equities' },
         { type: 'minHoldings', n: 3, label: 'At least 3 holdings' },
         { type: 'maxPct', tags: ['bond'], pct: 30, label: 'No more than 30% in bonds' },
       ] },
};

export const TEAM_IDS = [1, 2, 3, 4, 5, 6];
export const ROLES = ['CIO', 'Analyst', 'Risk Manager', 'Trader', 'Spokesperson'];
export const JUDGE_IDS = ['J1', 'J2', 'J3'];
export const PITCH_CRITERIA = [
  { id: 'fit',     label: 'Fit to the client' },
  { id: 'event',   label: 'Response to the life event' },
  { id: 'clarity', label: 'Clarity of the pitch' },
];
export const RETURN_POINTS = [40, 34, 28, 22, 16, 10];
export const SWITCHING_FEE = 0.005; // 0.5% of money moved in Round 2, when the fee is on
