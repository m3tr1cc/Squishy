# Squishy

Squishy is a customer-facing Codefair project: a tactile collection of
procedural wax-covered squishies whose continuous shells dent, crack, peel,
and break apart under pointer and touch pressure.

## Stack

- Vite
- React
- TypeScript
- React Three Fiber
- Three.js
- Drei
- Rapier, loaded only when detached debris needs rigid-body simulation
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

The butter body begins as a densely subdivided box projected onto a smooth,
rounded-cuboid surface. That watertight source is deterministically partitioned
into 48 irregular connected plates and extruded into one physically thick wax
coating.
Neighboring plates share a persistent bond graph, so every press accumulates
damage in the existing shell and extends nearby fissures instead of spawning a
decorative break artifact.

Butter, attached wax, and the conformal label consume the same dent field.
Pointer raycasts retain the exact surface point, normal, triangle, and wax
fragment. A fixed-step, typed-array damage simulation converts tap and hold
pressure into irreversible bond breaks, exposed seams, peeling plates, and
eventual detachment. A short tap cannot immediately release a loose piece:
detachment requires continued local peel load. Same-frame neighboring plates
leave as connected sheets of up to four pieces. Rapier is lazy-loaded only after
debris exists; its stable generation pool is capped at 24 mobile or 40 desktop
bodies, and overflow pieces settle deterministically. Detached pieces fade and
retire from both rendering and physics so spent flakes do not accumulate.

The `/soaps` experience uses the same damage, dent, raycast, and shell geometry
contracts for eight lower-density procedural bars. Each soap has a distinct
bright core, responsive material style, SOAP decal, deformation profile, and
seeded fracture network. The grid hydrates each fracture runtime progressively
and uses lightweight local debris motion, preserving one Canvas and a bounded
mobile workload while all eight soaps remain independently interactive.

The interaction layer supports mouse, pen, and up to two simultaneous mobile
touches. Touch motion beyond the scroll threshold cancels the press. Responsive
camera framing, capped device pixel ratio, deterministic geometry, and bounded
debris counts keep the experience suitable for mobile browsers and Codefair
iframes.

Five short crack recordings are decoded once through Web Audio. Playback is
driven only by actual bond-break events, uses every recording once per shuffled
cycle, avoids immediate repeats, and caps overlap during sustained fractures.

## Experience boundary

This version includes the butter squishy and an eight-soap page, persistent
thick wax shells, progressive damage and crack merging, local dents,
compression and rebound, peeling and fading debris, product decals, exact
surface raycasting, idle invitation motion, reduced-motion behavior, randomized
crack audio, route-aware previous/next navigation, completion feedback, and
in-page re-coating.

Impact/debris-specific audio, haptics, saved progress, analytics, and
Codefair-specific messaging remain intentionally deferred.
