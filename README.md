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

The butter page presents three horizontal rounded sticks in a centered vertical
stack: yellow, pink, and blue. Each watertight source uses 4,000 evenly
distributed triangles, is deterministically partitioned into 32 irregular
connected plates with its own seed, and is extruded into a physically thick,
color-tinted wax coating.
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
debris exists. All three butters share one physics world and one 24-body pool,
so flakes interact consistently without multiplying solver or fixed-collider
work; overflow pieces settle deterministically. Detached pieces fade and retire
from both rendering and physics so spent flakes do not accumulate.

The `/soaps` experience uses the same damage, dent, raycast, and shell geometry
contracts for six lower-density procedural soaps. Every pristine bar shares a
smooth hourglass silhouette with a broad flowing waist, rounded shoulders, and
softly curved ends, while its bright core, glossy translucent wax tint,
material response, and seeded fracture network remain distinct. Each core
carries the same locally hosted Fredoka `Soap` mark in a darker tone of its own
color, rendered as one clean fill without a stroke. A continuous squircular
mapping rounds the complete front contour independently of the shell depth, so
the end caps stay fully convex instead of inheriting cuboid-like bevels. A
topology-level seam pass
redistributes boundary samples into long clean segments while retaining the
same raycast IDs, real shell thickness, and triangle winding. The 3 x 2
landscape grid becomes 2 x 3 in portrait, hydrates each fracture runtime
progressively, and routes detached connected flakes through one shared,
lazy-loaded Rapier world. Twelve rounded lobe colliders and one invisible floor
make every flake fall through the grid and settle below the final row before
fading. The aggregate pool remains capped at 24 bodies, preserving one Canvas
and a bounded mobile workload while all six soaps remain independently
interactive.

The interaction layer supports mouse, pen, and up to two simultaneous mobile
touches. Touch motion beyond the scroll threshold cancels the press. Responsive
camera framing, capped device pixel ratio, deterministic geometry, and bounded
debris counts keep the experience suitable for mobile browsers and Codefair
iframes.

Five short crack recordings are decoded once through Web Audio. Playback is
driven only by actual bond-break events, uses every recording once per shuffled
cycle, avoids immediate repeats, and caps overlap during sustained fractures.

The `/clicker` experience adds a procedural white 3 x 3 key housing with
yellow, pink, and blue glossy key rows. Each key has independent spring travel,
a minimum visible tap duration, reduced-motion handling, and a sampled thock
routed through a small Web Audio mastering chain. A press also emits a bounded
burst into the shared synesthesia background without pretending that a wax
fracture occurred.

The `/slime` experience centers a low transparent plastic tub filled with one
watertight procedural slime volume. Pink and orange vertex colors begin as a
soft split, then converge locally around each exposed-top press and globally
over forty-eight bounded interactions. Those same presses add permanent dents
at a threefold tactile depth and lift the crown through the open rim with
decreasing growth increments. The container stays rigid, the final coral state
remains tappable, and three local wet-slime recordings play through a bounded
Web Audio shuffle. The bundled
Fredoka face used by the soaps also renders the curved lowercase `slime` mark.

The `/ipod` experience presents a first-generation green iPod mini with a
reflective anodized body and a flowing green/hot-pink synesthesia background.
Its body uses a vertically extruded slot cross-section, keeping a square
straight-on silhouette while curved depth transitions produce real side
highlights.
Its monochrome main menu is drawn at the original 138 x 110 display resolution.
Pointer and touch drags around the click wheel accumulate signed angle, move
one row per 18.75 degrees, and wrap continuously across both menu ends;
keyboard arrows expose the same selection behavior. Wheel increments play a
short synthesized piezo click and emit independent one-second stars and
four-lobed blobs around the iPod's visible perimeter. Up to thirty-two sparks
can overlap in one instanced draw call, with deterministic green/hot-pink
variation and no reduced-motion rendering. Wheel and center button taps reuse
the licensed mechanical sample through a deeper low-passed thock profile and
continue to trigger the larger synesthesia swirl independently of the sparks.

## Experience boundary

This version includes three-butter, six-soap, chocolate-slime,
slime-container, nine-key clicker, and green iPod mini pages, persistent
thick color-tinted wax shells, progressive damage and crack merging, local
dents, compression and rebound, peeling and fading debris, product decals,
exact surface raycasting, idle invitation motion, reduced-motion behavior,
randomized crack and clicker audio, route-aware previous/next navigation,
completion feedback, and in-page re-coating.

Wax-impact/debris-specific audio, haptics, saved progress, analytics, and
Codefair-specific messaging remain intentionally deferred.
