# Squishy

Squishy is a customer-facing Codefair project: a tactile, procedural
wax-covered butter stick that responds to pointer and touch presses with local
dents and a springy rebound.

## Stack

- Vite
- React
- TypeScript
- React Three Fiber
- Three.js
- Drei
- Plain CSS
- Vitest and Oxlint
- Vercel static deployment

## Local development

```bash
npm install
npm run dev
```

## Required checks

```bash
npm run lint
npm run check
npm test
npm run build
```

## Architecture

The butter stick is generated from a densely subdivided box whose vertices are
projected onto a rounded-cuboid surface. The inner body and outer wax shell
share base positions, normals, and dent fields, which keeps the shell separated
while both surfaces deform. Pointer intersections are copied into immutable
local/world impact records so future crack decals, wax fragments, and audio can
subscribe without changing the core interaction contract.

## First-prototype boundary

This version includes one squishy, procedural materials, exact surface
raycasting, dents, compression, rebound, persistent thick-shell wax breaks,
butter-label decals, a pointer-following wax highlight, idle invitation motion,
responsive framing, and reduced-motion behavior.

Detached fragment physics, audio, haptics, additional squishies, persistence,
analytics, and Codefair-specific messaging are intentionally deferred.
