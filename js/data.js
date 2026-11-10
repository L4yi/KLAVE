// ============================================================
// KLAVE — Shared Data, Constants, State & Formatting Helpers
// ============================================================

const localBeats = [];

const genres = [
  { name: 'Trap', color: '#1246F5' },
  { name: 'Drill', color: '#0D3ACC' },
  { name: 'UK Drill', color: '#0A2890' },
  { name: 'Afrobeats', color: '#1246F5' },
  { name: 'R&B', color: '#0D3ACC' },
  { name: 'Pop', color: '#0A2890' },
  { name: 'Amapiano', color: '#1246F5' },
  { name: 'Afro-fusion', color: '#0D3ACC' },
  { name: 'Alté', color: '#0A2890' },
  { name: 'Highlife', color: '#1246F5' },
  { name: 'Gospel', color: '#0D3ACC' },
  { name: 'Dancehall', color: '#0A2890' },
  { name: 'Reggaeton', color: '#1246F5' },
  { name: 'Jersey Club', color: '#0D3ACC' },
  { name: 'Boom Bap', color: '#0A2890' },
  { name: 'Lo-fi', color: '#1246F5' }
];

const MOOD_POOL = {
  Dark: [
    { title: "VOID WALKER", prod: "northhh", bpm: 145, key: "C# Min", price: "$30", icon: "🌑", tag: "DARK TRAP" },
    { title: "SHADOW REIGN", prod: "prodbyKlay", bpm: 142, key: "E Min", price: "$28", icon: "🖤", tag: "DRILL" },
    { title: "DARK MATTER", prod: "prodbyKlay", bpm: 140, key: "F Min", price: "$25", icon: "🌙", tag: "UK DRILL" }
  ],
  Melancholic: [
    { title: "EUPHORIA", prod: "soulkitchen", bpm: 88, key: "Ab Maj", price: "$40", icon: "🌧️", tag: "R&B" },
    { title: "SILK ROAD", prod: "soulkitchen", bpm: 92, key: "Bb Maj", price: "$42", icon: "📜", tag: "R&B" },
    { title: "ARCTIC WAVE", prod: "northhh", bpm: 120, key: "A Maj", price: "$25", icon: "🌫️", tag: "POP" }
  ],
  Hype: [
    { title: "RED ALERT", prod: "beatsbynorthhh", bpm: 138, key: "D Min", price: "$30", icon: "🔥", tag: "DRILL" },
    { title: "NEON GHOST", prod: "northhh", bpm: 150, key: "G Min", price: "$35", icon: "⚡", tag: "TRAP" },
    { title: "VOID WALKER", prod: "northhh", bpm: 145, key: "C# Min", price: "$30", icon: "💥", tag: "TRAP" }
  ],
  Chill: [
    { title: "SILK ROAD", prod: "soulkitchen", bpm: 92, key: "Bb Maj", price: "$42", icon: "🌊", tag: "R&B" },
    { title: "EUPHORIA", prod: "soulkitchen", bpm: 88, key: "Ab Maj", price: "$40", icon: "☁️", tag: "R&B" },
    { title: "LAGOS NIGHTS", prod: "afrobeatzzz", bpm: 105, key: "D Maj", price: "$45", icon: "🏖️", tag: "AFROBEATS" }
  ],
  Cinematic: [
    { title: "ARCTIC WAVE", prod: "northhh", bpm: 120, key: "A Maj", price: "$25", icon: "🎬", tag: "POP" },
    { title: "SILK ROAD", prod: "soulkitchen", bpm: 92, key: "Bb Maj", price: "$42", icon: "🌒", tag: "R&B" },
    { title: "DARK MATTER", prod: "prodbyKlay", bpm: 140, key: "F Min", price: "$25", icon: "🏜️", tag: "UK DRILL" }
  ],
  Rage: [
    { title: "RED ALERT", prod: "beatsbynorthhh", bpm: 138, key: "D Min", price: "$30", icon: "⚡", tag: "DRILL" },
    { title: "SHADOW REIGN", prod: "prodbyKlay", bpm: 142, key: "E Min", price: "$28", icon: "😤", tag: "DRILL" },
    { title: "NEON GHOST", prod: "northhh", bpm: 150, key: "G Min", price: "$35", icon: "🗡️", tag: "TRAP" }
  ],
  Romantic: [
    { title: "EUPHORIA", prod: "soulkitchen", bpm: 88, key: "Ab Maj", price: "$40", icon: "🌹", tag: "R&B" },
    { title: "SILK ROAD", prod: "soulkitchen", bpm: 92, key: "Bb Maj", price: "$42", icon: "🌇", tag: "R&B" },
    { title: "LAGOS NIGHTS", prod: "afrobeatzzz", bpm: 105, key: "D Maj", price: "$45", icon: "💫", tag: "AFROBEATS" }
  ],
  Spiritual: [
    { title: "ARCTIC WAVE", prod: "northhh", bpm: 120, key: "A Maj", price: "$25", icon: "🕊️", tag: "POP" },
    { title: "EUPHORIA", prod: "soulkitchen", bpm: 88, key: "Ab Maj", price: "$40", icon: "✨", tag: "R&B" },
    { title: "LAGOS NIGHTS", prod: "afrobeatzzz", bpm: 105, key: "D Maj", price: "$45", icon: "🌤️", tag: "AFROBEATS" }
  ],
  Trap: [
    { title: "VOID WALKER", prod: "northhh", bpm: 145, key: "C# Min", price: "$30", icon: "🎵", tag: "TRAP" },
    { title: "NEON GHOST", prod: "northhh", bpm: 150, key: "G Min", price: "$35", icon: "🔥", tag: "TRAP" },
    { title: "RED ALERT", prod: "beatsbynorthhh", bpm: 138, key: "D Min", price: "$30", icon: "⚡", tag: "DRILL" }
  ]
};

const NERO_FALLBACK = {
  Dark: "Minimal, shadowy, built for 3am lyrics. These live in the low frequencies.",
  Melancholic: "Slow tempos, minor keys. Beats that feel like looking out a window when it rains.",
  Hype: "Fast hi-hats, heavy kicks, zero chill. Made to move crowds.",
  Chill: "Laid back, warm, no rush. Good space for storytelling and R&B hooks.",
  Cinematic: "Wide sound, emotional range. Build a full concept around these, not just a song.",
  Rage: "No melody, just aggression. Hard kicks, distorted 808s.",
  Romantic: "Soft and intentional. The kind of record people send at midnight without a caption.",
  Spiritual: "Gospel-influenced, elevated energy. For records with a message that goes deeper.",
  Trap: "Rolling hi-hats, punchy 808s, minor key melodies. Versatile foundation."
};

// Beat of the Week — Mock Data (Frontend-only spotlight feature)
const BOTW_MOCK = {
  id: 'botw-void-walker',
  isMock: true,
  weekLabel: 'WK 45 · NOV 2026',
  title: 'VOID WALKER',
  monogram: 'VW',
  prod: 'northhh',
  producerId: '',
  bpm: 145,
  key: 'C# Min',
  genre: 'Dark Trap',
  mood: 'Dark',
  plays: 2840,
  rating: '4.9',
  ratingCount: 38,
  stemsVerified: 6,
  price: 30,
  wavPrice: 65,
  exclPrice: 250,
  neroNote: 'Sub-heavy 808 glides locked to 145 BPM with eerie C# minor bell plucks. 6 human-made stems verified by NERO.',
  waveHeights: [
    32, 54, 40, 76, 88, 62, 45, 92, 70, 50,
    84, 96, 64, 42, 78, 90, 58, 36, 72, 95,
    82, 48, 66, 88, 74, 52, 90, 80, 44, 68,
    94, 60, 38, 75, 86, 56, 42, 70, 62, 36
  ],
  audioUrl: ''
};

// Shared player & UI state
const FREE_PREVIEW_SECONDS = 30;
const FREE_BEAT_LIMIT = 3;
const PREVIEW_TAG_ID = '';
const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2';
const ADMIN_EMAIL = 'beatsbynorth21@gmail.com';
const PAYSTACK_PUBLIC_KEY = 'pk_live_188672a73e847bfa7e890e09144081018885d84b';
const PAYSTACK_PLAN_CODE_PRO7 = 'PLN_xmwbhnqhh2zc080';
const PAYSTACK_PLAN_CODE_PRO25 = 'PLN_1bdx8i1kkxopbg0';

const PLAN_INFO = {
  free: { label: 'Free plan' },
  pro7: { label: 'Pro plan — $7/mo', code: PAYSTACK_PLAN_CODE_PRO7, recurring: true },
  pro25: { label: 'Pro+ plan — $25/mo', code: PAYSTACK_PLAN_CODE_PRO25, recurring: true }
};

let beats = localBeats;
let playing = false;
let cur = null;
let prog = 0;
let tmr = null;
let nopen = false;
let _authMode = 'in';
let _pendingEmail = '';
let _selectedMood = null;
let _usdToNgnRate = null;

const audioEl = new Audio();

function getBeats() {
  return window._firestoreBeats || localBeats;
}

function findBeatById(id) {
  if (id === BOTW_MOCK.id) return BOTW_MOCK;
  const list = getBeats();
  return list.find(x => (x.id || list.indexOf(x)) === id) || null;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function makeWaveBars(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const h = 6 + Math.round(Math.abs(Math.sin(i * 0.8)) * 34 + Math.random() * 8);
    out += '<div class="wb" style="height:' + h + 'px"></div>';
  }
  return out;
}

function coverImg(b) {
  return (b && b.coverUrl) ? '<img src="' + escapeHtml(b.coverUrl) + '" loading="lazy" alt=""/>' : '';
}

async function getUsdToNgnRate() {
  if (_usdToNgnRate) return _usdToNgnRate;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    _usdToNgnRate = (d && d.rates && d.rates.NGN) ? d.rates.NGN : 1600;
  } catch (e) {
    _usdToNgnRate = 1600;
  }
  return _usdToNgnRate;
}

function formatKlavePrice(usd) {
  if (typeof usd !== 'number') return '$' + usd;
  if (localStorage.getItem('klave-currency') === 'ngn') {
    const rate = (typeof _usdToNgnRate !== 'undefined' && _usdToNgnRate) ? _usdToNgnRate : 1600;
    return '₦' + Math.round(usd * rate).toLocaleString();
  }
  return '$' + usd;
}
