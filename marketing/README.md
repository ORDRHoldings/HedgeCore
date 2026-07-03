# ORDR Treasury — Marketing Site

Standalone product marketing website for **ORDR Treasury**, part of the ORDR Holdings ecosystem.
Built with Next.js 15 + Tailwind v4, sharing the ecosystem design system (ink `#0A0D13`,
product accent, Archivo + IBM Plex, terminal-panel signature element).

- All copy lives in `src/content.ts` — edit content there, not in JSX.
- The per-product accent is set in two places: `src/content.ts` (`accent`) and
  `src/app/globals.css` (`--color-accent` in `@theme`).

## Develop

```bash
npm install
npm run dev   # http://localhost:3201
```

## Deploy

Deploy to Vercel as its own project (root = this folder):

```bash
vercel && vercel --prod
```
