# KLAVE

**AI-powered beat marketplace — 100% human-made beats, verified.**

KLAVE is a marketplace where producers sell beats directly to artists, with a stem-upload verification flow that proves every beat is human-made, and NERO — an integrated AI assistant — helping both producers and buyers navigate the platform.

Built and maintained solo, entirely from a mobile phone, by [Northhhern Labs](https://github.com/Northhhern-Labs).

---

## Status

🚧 **Not yet live.** Target launch: end of 2026.

Currently in active development. Core marketplace, auth, and NERO are functional. Security hardening and App Store/Play Store packaging are the remaining blockers before public launch.

---

## Features

- **Beat marketplace** — browse, filter by genre/mood, search by BPM/key
- **NERO** — AI assistant (powered by Claude) for beat discovery, producer guidance, and upload assistance
- **Producer tools** — analytics dashboard, producer cards, follow system, beat mood matcher
- **Tiered licensing** — MP3 / WAV / Trackouts / Exclusive pricing per beat
- **4 producer payout tiers**:
  | Tier | Royalty rate |
  |---|---|
  | Free | 19% |
  | $7/month | 10% |
  | $25/month | 5% |
  | $299 lifetime | 0% |
- **Human-made verification** — stem-upload flow + NERO voice guidance to confirm original work
- **Google Sign-In + email/password auth** with email verification
- **Report system** for flagging stolen/infringing content

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Single-file HTML/CSS/JS (no framework/build step) |
| Hosting | [Vercel](https://vercel.com) |
| Auth | Firebase Authentication (email + Google) |
| Database | Firestore |
| Media storage | Cloudinary |
| AI | Claude API (via Vercel serverless function) |

### Why single-file?

The entire app is built and maintained from a mobile phone with no PC/laptop access. A single-file architecture keeps the workflow manageable: one file to download, edit, and re-upload to GitHub — no local build tooling required.

---

## Project Structure

```
klave/
├── index.html          # Main app — all screens, styles, and logic
├── api/
│   ├── upload.js        # Cloudinary upload proxy (serverless)
│   └── nero.js           # NERO AI router — proxies to Claude API (serverless)
├── manifest.json         # PWA manifest
└── README.md
```

> The app itself lives entirely in `index.html`. Screens (Home, Search, Upload, Analytics, Mood, Profile, Auth, Settings) are `<div class="screen">` blocks toggled via JS — there's no client-side router or bundler.

---

## Getting Started

This project is deployed via Vercel and requires no local build step.

1. Clone the repo
2. Set the following environment variables in your Vercel project:
   - `ANTHROPIC_API_KEY` — used by `/api/nero.js`, never exposed client-side
   - Cloudinary upload preset/cloud name (currently hardcoded — see Known Issues)
3. Push to `main` — Vercel auto-deploys

Firebase config is currently embedded directly in `index.html` (this is safe — Firebase client keys are meant to be public; real security lives in Firestore rules, not the config object).

---

## Known Issues / Security Roadmap

These are acknowledged and tracked, not yet fixed:

- [ ] Admin role checks currently run client-side only — needs to move to Firestore rules / server-side verification
- [ ] Cloudinary upload preset is unsigned and exposed — needs a signed upload flow
- [ ] App Store / Play Store submission requires a computer (not currently available) — blocking mobile app store launch

**Do not consider this production-hardened until the above are resolved.**

---

## Contributing

This is currently a solo project. Not accepting external contributions yet, but feel free to open an issue if you spot a bug.

---

## License

Proprietary — All rights reserved. See license header in `index.html`.

© 2026 Northhhern Labs.
