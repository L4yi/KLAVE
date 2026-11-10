# KLAVE

**AI-powered beat marketplace — 100% human-made beats, verified.**

KLAVE is a marketplace where producers sell beats directly to artists, with a stem-upload verification flow that proves every beat is human-made, and NERO — an integrated AI assistant — helping both producers and buyers navigate the platform.

Built by [Northhhern Labs](https://github.com/Northhhern-Labs).

---

## Status

🚧 **Not yet live.** Target launch: end of 2026.

Currently in active development. Core marketplace, auth, Beat of the Week spotlight, and NERO are functional.

---

## Features

- **Beat of the Week Spotlight** — mobile-first, dark-blue curated feature card on the Home screen with interactive 30s waveform preview, stem verification badge, NERO curator insight, and instant license tier selector (`MP3` / `WAV + Stems` / `Exclusive`)
- **Beat marketplace** — browse, filter by genre/mood, search by BPM/key
- **NERO** — AI assistant (powered by Claude) for beat discovery, producer guidance, and upload assistance
- **Producer tools** — analytics dashboard, producer cards, follow system, beat mood matcher
- **Tiered licensing** — MP3 / WAV / Trackouts / Exclusive pricing per beat
- **Human-made verification** — stem-upload flow + NERO guidance to confirm original work
- **Google Sign-In + email/password auth** with email verification
- **Report & rating system** for community moderation and beat ratings

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Modular Vanilla HTML / CSS / JS (no bundler or build step required) |
| Hosting | [Vercel](https://vercel.com) |
| Auth | Firebase Authentication (email + Google) |
| Database | Firestore |
| Media storage | Cloudinary |
| AI | Claude API (via Vercel serverless function) |

---

## Project Structure

```
klave/
├── index.html                  # Clean semantic app shell (screens, player, modals)
├── css/
│   ├── base.css                # CSS variables, dark/light themes, reset, splash & skeletons
│   ├── layout.css              # App shell, topbar, bottom-nav, mini/full player, modals & forms
│   └── screens.css             # Home, Beat of the Week (.botw-*), Search, Upload, Profile, Plans, Auth
├── js/
│   ├── firebase-init.js        # Firebase Auth & Firestore initialization + unified SDK bindings
│   ├── data.js                 # Shared constants, genres, mood pools, BOTW_MOCK & price helpers
│   ├── beat-of-the-week.js     # Beat of the Week card renderer, 30s procedural audio & waveform UI
│   ├── player.js               # Audio engine, mini-player waveform & full-screen player controls
│   ├── marketplace.js          # Home & Search screens, genre chips, Paystack checkout & plans
│   ├── producer.js             # Upload flow, Analytics, Mood Matcher, Producer Card & public view
│   ├── auth-profile.js         # Auth, Profile, Admin tools, Referrals, NERO chat, Ratings & Settings
│   └── app.js                  # Navigation router, splash boot, diagnostics & event listeners
├── api/                        # Vercel serverless functions (upload, nero, payments, referrals)
├── lib/
│   └── cloudinary-sign.js      # Cloudinary authenticated URL signing helper
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker
└── README.md
```

---

## License

Proprietary — All rights reserved. See license header in `index.html`.

© 2026 Northhhern Labs.
