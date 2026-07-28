# Design QA — milky wax and irregular fracture

## Evidence

- Source visual truth: `C:\Users\jleon\AppData\Local\Temp\codex-clipboard-54c7eaa0-689f-4f4b-9693-6c995a6b13fe.png`
- Desktop pristine: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\desktop-pristine.jpg`
- Desktop first crack: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\desktop-first-crack.jpg`
- Mobile pristine: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-pristine.jpg`
- Mobile first crack: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-first-crack.jpg`
- Mobile completed shell: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-complete.jpg`
- Mobile fresh re-coat: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-recoat.jpg`
- Mobile re-coated first crack: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-recoat-first-crack.jpg`
- Combined source/implementation comparison: `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\reference-vs-implementation.jpg`

The supplied source is 1739 × 729 pixels and shows the previous fully fractured
state. The written change request intentionally supersedes its yellow wax,
pastel background, camera angle, and uniform fracture pattern. Desktop captures
are 1440 × 900 CSS pixels; mobile captures are 390 × 844. Browser screenshots
were captured at density 1, with a separate performance pass forcing the R3F
backing buffer to 585 × 1266 for DPR 1.5.

The combined image places the supplied source and the 1440 × 900 first-crack
implementation in one 1440 × 720 comparison canvas. A separate focused crop was
not necessary: the product occupies most of each source half and the label,
wax edge, crack seam, and silhouette are clearly readable at full comparison
resolution.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The wax is neutral, milky ivory rather than yellow. Muted label ink remains
  visible through the intact coating, while exposed butter and ink become
  saturated and crisp through a broken opening.
- The canvas, visual floor, loading state, and viewport corners are pure black.
  All four sampled mobile corner pixels were RGB `0, 0, 0`; there is no horizon,
  tabletop reflection, pastel glow, or contact-shadow backdrop.
- The camera and product rotation are both centered at zero. The long butter
  edges read horizontally and the left/right rounded ends are symmetric.
- A first press opens connected, irregular seams without shrinking or outlining
  every procedural plate. A second nearby press can lift one broad sheet rather
  than producing a radial flower artifact or a field of equal tiles.
- The 48-plate topology produces visibly mixed shard areas. Two distinct
  longitudinal weak corridors, branches, and bond-tip stress allow cracks to
  continue across the coating while remaining part of one fixed shell.
- Mouse movement over the settled shell produced an exact zero-pixel screenshot
  difference. The pointer cursor remains, but no light, highlight, or material
  state follows the pointer.
- A full distributed-press stress run consumed the entire coating, exposed the
  accessible `Re-coat wax` control, and produced no browser errors. Re-coating
  restored a pristine shell; the following center press produced a visibly
  different crack route, confirming a fresh seed.

## Required fidelity surfaces

- **Fonts and typography:** The existing condensed butter-label hierarchy and
  copy remain unchanged. Ink is intentionally lower-contrast under intact wax
  and fully legible once exposed. Loading and replay text retain readable
  system typography and at least 4.5:1 contrast on black.
- **Spacing and layout:** The canvas remains the entire product. Desktop and
  390 × 844 mobile views keep the stick within approximately 8% horizontal safe
  margins without clipping; the replay button respects safe-area insets.
- **Colors and tokens:** Background is `#000000`. Wax outer/inner/edge colors
  are neutral ivory/gray with no orange broken faces. Butter remains warm yellow
  and label ink remains desaturated blue through the coating.
- **Image quality and asset fidelity:** The butter, label, wax thickness, and
  fractures remain procedural/vector WebGL assets at native resolution. No
  raster placeholder, crack decal, CSS drawing, or spawned breakage graphic was
  introduced.
- **Copy and content:** `4oz.`, `NET WT. (113 G)`, `SALTED`, `BUTTER`, hidden
  instructions, completion announcement, and `Re-coat wax` remain coherent and
  unchanged.
- **Interaction and accessibility:** Mouse and touch-sized taps create dents and
  persistent cracks. The canvas retains its accessible label; completion uses
  `aria-live`; replay is a keyboard-focusable 44 px button with a visible white
  focus treatment. Reduced motion still suppresses the idle invitation pulse
  and accelerates rebound.

## Interaction and performance QA

- Desktop 1440 × 900 pristine, first crack, and second-press sheet lift: passed.
- Mobile 390 × 844 pristine, first tap, complete shell, and re-coat cycle: passed.
- Re-coated topology differs from the previous coating while remaining stable
  for the full run: passed.
- Hover-off versus hover-on after the intro settled: exact pixel match.
- Mobile viewport corners: all RGB `0, 0, 0`.
- DPR 1.5 steady idle: 60.02 fps average, 16.7 ms p50, 16.9 ms p95,
  17.1 ms maximum across 300 frames.
- DPR 1.5 after one press: 60.00 fps average, 16.7 ms p50, 16.9 ms p95,
  20.8 ms maximum across 300 frames.
- DPR 1.5 multi-crack state: 60.00 fps average, 16.7 ms p50, 16.8 ms p95,
  17.2 ms maximum across 300 frames.
- Renderer remained at 16 calls in the sampled states. The reported 96,204
  renderer triangles include shadow and transmissive re-passes; the procedural
  shell itself remains under the tested 35,000-triangle budget with three
  material groups.
- No WebGL loss, uncaught Rapier exception, stale-body error, or browser-console
  error occurred during the completion/re-coat stress run. Existing Three.js
  deprecation warnings remain dependency-level and non-blocking.

## Comparison history

1. **P1 — backdrop was visibly gray and labels disappeared beneath the new
   material.** Replaced the lit floor with an unlit black collision surface,
   removed the horizon/contact pass, and added a low-opacity depth-aware label
   presentation over the physical wax while retaining the crisp inner label.
2. **P1 — two taps released a large field of fragments at once.** Changed
   crack-tip transfer to use break energy rather than raw contact load and
   localized the geodesic contact radius to `0.78`, preventing the first press
   from pre-damaging every nearby bond equally.
3. **P2 — some fresh mobile seeds needed a second tap before any seam was
   visible.** Raised local damage to `4.2` while retaining the smaller radius,
   producing a visible first-tap fissure without returning to the earlier
   same-frame avalanche.
4. Re-captured pristine, first-crack, full-break, and fresh re-coat states after
   those fixes. Final browser comparison found no remaining P0/P1/P2 issue.

## Follow-up polish

- P3: actual device testing can supplement the in-app Chromium touch-sized
  viewport with hardware-specific thermal and GPU measurements.
- Audio, haptics, wax dust, additional squishies, persistence, and analytics
  remain intentionally outside this update.

## Clean fracture-line iteration

### Evidence and normalization

- Source visual truth:
  `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\.codex-remote-attachments\019f9ef9-371e-7273-962c-a044e8110cb3\419c07b7-6f7f-4005-82a8-099786fb1deb\1-Photo-1.jpg`
- Browser-rendered implementation:
  `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\mobile-clean-seams-final.png`
- Focused side-by-side comparison:
  `C:\Users\jleon\Documents\promptparty_projects\Squishy\qa\clean-seam-reference-vs-implementation-final.png`
- Source pixels: 591 × 1055, including mobile browser chrome.
- Implementation pixels and CSS viewport: 390 × 844 at density 1.
- Comparison normalization: the butter region was cropped from each artifact,
  scaled proportionally into two 680 × 430 slots, and placed in one 1400 × 470
  black comparison canvas.
- State: three nearby taps on a fresh seeded coating after the intro settled.

The focused comparison was required because the requested change concerns the
small fracture silhouette rather than the unchanged full-screen composition.
The left reference shows repeated one-cell horizontal, vertical, and diagonal
steps. The right implementation shows long straight or gently bent segments,
with angle changes retained only where real shard boundaries meet.

### Findings

- No actionable P0, P1, or P2 differences remain for the requested seam
  cleanup.
- The topology pass reduces sharp front-face mesh-grid turns from 151 to 52, a
  65.6% reduction; sharp turns now account for less than 20% of measured
  boundary turns and are concentrated at real multi-shard junctions.
- Existing boundary vertices are redistributed along simplified deterministic
  line segments. No crack decal, shader mask, or second visual shell was added.
- Both sides of every intact seam continue to share identical positions.
  Opened seams remain symmetrical and retain the existing wax thickness.
- Every moved source triangle preserves its winding and at least 15% of its
  original area. Maximum source-vertex displacement is capped at 0.09 model
  units, and surrounding non-boundary vertices receive a short falloff so the
  surface does not form needle triangles.

### Required fidelity surfaces

- **Fonts and typography:** unchanged; label type remains muted beneath wax and
  crisp through openings.
- **Spacing and layout rhythm:** unchanged; the same centered 390 × 844 framing
  was used for the comparison.
- **Colors and visual tokens:** unchanged; black background, neutral wax, warm
  butter, and blue label ink remain consistent.
- **Image quality and asset fidelity:** the cleaned fracture is still generated
  by the physical procedural shell. The focused crop shows no repeated
  staircase artifact, transparency halo, or raster crack overlay.
- **Copy and content:** unchanged.

### Comparison history

1. **P2 — fracture silhouettes followed the source triangle grid.** The source
   screenshot showed repeated sawtooth steps on every exposed edge.
2. Added deterministic boundary-chain ordering, surface-aware line
   simplification, capped vertex redistribution, two-ring falloff, and
   triangle-winding/area validation.
3. Re-captured two random coatings at 390 × 844. Both produced connected long
   cuts without the repeated mesh-grid teeth. The focused side-by-side
   comparison found no remaining P0/P1/P2 issue.

final result: passed

## Fracture audio iteration

### Implementation

- The five supplied 48 kHz stereo PCM WAV files are imported through Vite URL
  assets, decoded once after the first pointer gesture, and retained in one
  app-owned Web Audio context across wax-shell remounts.
- Audio is requested only when the fracture simulation emits one or more real
  `bond-break` events. A press that only dents the squishy remains silent.
- A seeded shuffle bag plays all five recordings once before reshuffling and
  prevents an immediate repeat at cycle boundaries.
- Per-track gain correction, a restrained master gain, a dynamics compressor,
  a 70 ms minimum interval, and a four-source overlap cap keep sustained
  cracking audible without clipping or turning into a wall of sound.
- Re-coating resets the shuffle state and stops sounds from the prior coating
  without closing the unlocked audio context.

### Mobile browser verification

- Viewport: 390 x 844 CSS pixels at DPR 1.5.
- All five recordings loaded and decoded successfully.
- Four nearby presses generated seven audible crack bursts from actual bond
  breaks; visual-only dent frames did not request playback.
- The first five played indices were `0, 4, 1, 3, 2`, proving one complete
  five-track cycle. The observed sequence contained no adjacent repeats.
- Post-fracture performance across 300 frames: 60.00 FPS average, 16.8 ms p95,
  16.9 ms maximum, 16 draw calls, and no browser-console errors.
- Production build output contains five fingerprinted WAV assets totaling
  approximately 567 KiB.

### Release note

- The supplied `crack5.wav` contains embedded artist/source metadata. Confirm
  redistribution rights for all five recordings before the public launch.

final result: passed

## Mobile tap-highlight regression

- The earlier desktop-emulation check did not reproduce Android's compositor
  highlight, so its pass was insufficient to close the physical-device issue.
- Root cause: the wax `pointerover` handler changed `document.body` to
  `cursor: pointer`. Touch pointers also emit pointer-over events. Android
  Chromium can then choose the largest enclosing hand-cursor node as its tap
  target, which made the viewport-sized body flash blue.
- Final fix: no scene event mutates the body. Fine-pointer mouse hover now
  toggles a cursor class only on the WebGL canvas, while touch input always
  leaves the document cursor untouched.
- React Three Fiber's canvas event manager no longer installs unused click,
  double-click, context-menu, or wheel handlers. Pointer-down is explicitly
  non-passive, and only a validated butter/wax raycast calls `preventDefault()`;
  background touches retain their normal host-page behavior.
- Native pointer-cancel and lost-capture events now release their matching
  press directly. Scroll takeover cannot strand a dent or consume one of the
  two supported touch slots.
- Root, wrapper, sizing div, and canvas styles all use a zero-alpha tap
  highlight. The stage also disables selection and touch callouts while
  preserving `touch-action: pan-y`. The browser theme color is now black.
- Verified at 390 x 844: the butter press still cracks and plays audio, body
  cursor remains empty, focus remains on the body rather than the full-screen
  event wrapper, computed tap highlight is `rgba(0, 0, 0, 0)`, and no runtime
  errors are logged.
- Regression tests verify the custom event manager lifecycle, non-passive
  pointer-down, absence of full-screen click handlers, and native cancellation
  cleanup.

final result: implementation passed; physical Android confirmation pending

## Eight-soap experience

### Reference and final captures

- Product reference: `Photo 1.jpg` supplied in the task, used for the two-column
  soap assortment, varied material personalities, and centered SOAP branding.
- Desktop final: `qa/soap-desktop-pristine.png` at 1440 x 900.
- Mobile final: `qa/soap-mobile-pristine.png` at 390 x 844.
- Mobile interaction: `qa/soap-mobile-cracked.png` after one press on Hard Wax.

### Visual and interaction findings

- `/soaps` presents all eight coated bars at once in a 4 x 2 landscape grid and
  a 2 x 4 portrait grid. The composition stays on the same seamless black
  studio background as the butter page.
- Each bar has a distinct silhouette, spring profile, bright core color,
  material response, coating seed, and SOAP decal. Sprinkles and Sugar add
  restrained procedural surface accents without additional texture downloads.
- The intact layer is pale transmissive paraffin tinted toward each soap core.
  Decals are muted on the coating and the saturated core becomes crisp through
  real fracture openings.
- A press on one bar affects only its own topology. The resulting opening is a
  connected region with long plate boundaries and exposes the correct core;
  there are no press-specific crack meshes or decals.
- Detached soap plates use the shared deterministic fade policy. Butter debris
  retains Rapier motion, then retires from both the combined geometry and the
  rigid-body pool after its fade.
- Previous/next controls are 44–48 px circular targets with safe-area offsets,
  real links, keyboard focus styles, and non-wrapping disabled endpoints.
  Direct `/soaps` loads, browser Back/Forward, and a fresh scene on re-entry
  were verified.
- Existing soap damage remained intact while switching the live viewport from
  390 x 844 portrait to 1440 x 900 landscape; only grid positions and camera
  fit changed.
- A route-return regression repeated three center presses before and after a
  butter → soaps → browser-Back sequence. Both fresh butter sessions emitted
  two real crack-audio bursts, confirming that no stale topology/state arrays
  survive route changes.

### Mobile performance

- Viewport: 390 x 844 CSS pixels, Canvas DPR capped at 1.25.
- Original neutral-shell baseline: 56,180 rendered triangles and 47 draw calls.
- Original idle 300-frame sample: 59.21 FPS average and 17.1 ms p95.
- Original post-press 300-frame sample: 59.99 FPS average and 17.1 ms p95.
- The eight low-density fracture runtimes hydrate progressively after the
  lightweight grid appears, avoiding one large topology-construction spike.
- No uncaught browser, Three.js, audio, or Rapier errors were observed.
- The canvas retains transparent tap highlights, no text selection, and
  `touch-action: pan-y`; a mobile-sized press produced no viewport flash.

final result: passed

## Tinted soap wax, long seams, and butter trio

### Material and topology verification

- Every soap coating now has a distinct cached pastel palette derived from its
  core hue. Surface lightness remains between `0.76` and `0.80`; the
  attenuation color is darker and more saturated so the intact shell hints at
  the bright material beneath it.
- Soap wax remains an opaque physical material (`opacity: 1`,
  `transparent: false`) with `0.18` transmission. This avoids alpha sorting
  halos and keeps the fully hydrated grid at the same 47-draw-call structure;
  no tint overlay or crack-line mesh was added.
- The long-seam topology profile uses a `0.24` simplification tolerance,
  bounded `0.24` source-vertex movement, a 24-degree normal span, the existing
  15% triangle-area guard, and deterministic closed-boundary handling. Each
  boundary chain receives the largest safe update independently, so one tight
  region cannot force every seam back toward its source-grid staircase.
- Across all eight soap shapes and eight representative coating seeds, visible
  front-facing non-junction seams retain at most a 22% sharp-turn ratio.
  Fragment ownership, bond edges, source triangle IDs, raycast IDs, winding,
  and deterministic seed output remain unchanged.
- The denser front sampling required for clean soap cuts stays within 3,000
  source triangles per bar. Complete hydrated body, wax, and two decal passes
  total 85,668 visible triangles across the eight products, below the enforced
  90,000-triangle budget.

### Three-butter presentation and physics

- The butter page now contains three straight horizontal bars stacked at
  `y = 1.62`, `0`, and `-1.62`, with yellow, pink, and blue cores and matching
  pale wax palettes. Expanded shells retain a `0.16` model-unit gap.
- Each bar mixes a unique salt into the page coating seed, so its crack layout
  is stable for one coating and distinct from its siblings.
- The responsive camera fits the complete expanded stack within 90% normalized
  viewport bounds at 280 x 560, 390 x 844, and 1440 x 900 while remaining
  centered and straight-on.
- Each independently deformable bar uses 4,000 source triangles and 32 wax
  plates. Three bars total 12,000 source triangles, only 22% above the previous
  single dense source.
- All three bars feed one lazy Rapier world containing every butter collider and
  the shared floor, preventing upper debris from falling through lower sticks
  without duplicating solvers or fixed colliders. The aggregate pool is capped
  at the prior mobile ceiling of 24 live debris bodies.
- One shared butter-label texture serves all three bars. Butter-route DPR is
  capped at 1.25 for coarse pointers and 1.5 otherwise.

### Deployed preview QA

- The Vercel preview returned HTTP 200 for both `/` and `/soaps`.
- At the default desktop viewport, all three butter bars render straight,
  centered, and fully inside the frame with visibly distinct cream-yellow,
  pastel-pink, and pastel-blue coatings.
- At 390 x 844, the butter stack remains centered with generous separation
  between bars and unobstructed previous/next navigation controls.
- A coordinate tap on the pink butter produced connected long diagonal seams
  without a viewport highlight, text selection, or blue-screen flash.
- At 390 x 844, all eight soaps remain visible in the 2 x 4 grid. Their intact
  wax layers read as eight distinct pastel tints related to the underlying
  coral, lavender, cream, pink, cyan, violet, green, and blue cores.
- Repeated coordinate taps on Hard Wax exposed the bright coral core through
  long straight-edged pieces. Detached pieces faded; attached peeled pieces
  remained part of the coherent coating.
- No uncaught application, Three.js, audio, or Rapier errors appeared. The
  browser logged only Three.js's upstream `Clock` deprecation warning.

### Automated verification

- `npm run lint`
- `npm run check`
- `npm test`: 23 files, 118 tests
- `npm run build`
- The production build retains the independently lazy-loaded soap and Rapier
  chunks and adds no dependency or Supabase migration.

## Soap debris gravity and floor

- Removed the soap-only ballistic approximation that applied weak downward
  movement and a conspicuous fixed-axis spin.
- Detached neighboring plates now form connected one-to-four-piece flakes and
  enter one shared, lazy Rapier world for all eight soaps.
- Launch velocity has a small downward bias, low angular velocity, and full
  gravity. Eight rounded body colliders let flakes glance off lower soaps, while
  an invisible collision floor below the final row gives every flake a clear
  fall destination before its 2.75-second timeout fade.
- The world remains capped at 24 active bodies. Convex collider support points
  remain capped at 48 per plate while the visible wax geometry stays
  full-resolution.
- Automated coverage verifies deterministic launches, restrained angular
  velocity, floor clearance in both responsive layouts, positive collider
  dimensions, the shared body cap, and enough fade time for a top-row flake to
  reach the floor.
- Deployed preview QA on
  `https://squishy-f0ktjq6a1-m3tr1ccs-projects.vercel.app/soaps` used seven
  coordinate presses on Hard Wax. A detached flake visibly fell below the
  second soap row to the bottom collision area, then was gone 1.8 seconds
  later; it did not hover or spin in place.
- No uncaught application, WebGL, or Rapier errors appeared. The console
  retained only the existing Three.js Clock and Rapier initialization
  deprecation warnings.
- Final verification: `npm run lint`, `npm run check`, `npm test` (24 files,
  123 tests), and `npm run build`.

## Six molded-soap redesign

### Reference and captures

- Visual reference:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/b9e14cec-c4d4-4a90-9a9e-8c0e4a449547/1-Photo-1.jpg`.
- Desktop final: `qa/soap-redesign-desktop.png` at 1440 x 900.
- Mobile final: `qa/soap-redesign-mobile.png` at 390 x 844.
- Mobile cracked state: `qa/soap-redesign-mobile-cracked.png`.
- Side-by-side reference comparison: `qa/soap-redesign-comparison.png`.

### Fidelity decisions

- Reduced the assortment from eight bars to six and changed the responsive
  layout to 3 x 2 in landscape and 2 x 3 in portrait.
- All pristine soaps now use one molded silhouette: rounded lobes taper into a
  shallow center waist, with a subtle front/back puff. The shared geometry,
  label surface, previews, raycast surface, and paired-lobe colliders all follow
  that same profile.
- Every label says `SOAP` in locally hosted Fredoka 700. Its ink is derived
  from the product hue: amber on yellow, bright pink on soft pink, violet on
  lavender, dark blue on light blue, coral on blush, and forest green on lime.
- The wax is now glossier and more transparent (`0.62` transmission, `0.16`
  roughness, `0.65` clearcoat). Its pastel tint still identifies the underlying
  soap before breakage, while labels and Sprinkles/Sugar details remain visible
  through the intact coating.
- Fracture topology, clean long seam simplification, deformation, crack audio,
  connected Rapier debris, falling behavior, and timed fade remain unchanged.

### Comparison iterations

- Initial comparison found the label pass too diffuse through the thicker
  milky coating. Increasing transmission and lowering roughness made the core
  color and tone-on-tone mark more legible.
- Moving the label very near the shell temporarily caused letter fragments to
  clip through the intact wax. Returning it to a shallow internal offset kept
  the mark coherent and preserved the intended under-wax softness.
- Final comparison confirms six complete shapes with no crop, consistent
  pinched silhouettes, readable hue-matched `SOAP` marks, bright internal
  designs, and unobstructed navigation at both target viewports.

### Interaction QA

- Six repeated mobile presses on the upper-left soap created connected clean
  seams and exposed the bright core without selecting the page or producing a
  blue viewport highlight.
- Detached wax fell away from the soap and retired after its existing fade
  timeout. The permanent opening remained physically consistent with the
  broken coating.
- The portrait grid retained all six soaps after interaction and kept the
  previous/next controls clear of the products.

### Verification

- Automated catalog coverage enforces six entries, identical shared geometry,
  the center waist, six `SOAP` atlas cells, hue-matched label inks, responsive
  3 x 2 / 2 x 3 placement, two colliders per soap, and bounded triangle counts.
- `npm run lint`, `npm run check`, `npm test` (24 files, 123 tests), and
  `npm run build` all pass.
- The redesign adds no runtime package and no Supabase migration.
- Final result: passed.

## Smooth hourglass contour and label refinement

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/4333b263-3cba-4e3c-bb3c-31c0e0956269/1-Photo-1.jpg`
  at 1536 x 532 pixels.
- Desktop implementation: `qa/soap-hourglass-desktop.png` at 1440 x 900,
  CSS viewport 1440 x 900, DPR 1.
- Mobile implementation: `qa/soap-hourglass-mobile.png` at 390 x 844,
  CSS viewport 390 x 844, DPR 1.5; the browser capture is normalized to CSS
  pixels.
- Mobile cracked state: `qa/soap-hourglass-mobile-cracked.png` at
  390 x 844, CSS viewport 390 x 844, DPR 1.5 with the same normalization.
- Focused equal-density label comparison:
  `qa/soap-hourglass-label-comparison.png`. Both sides are normalized to
  720 x 300 pixels.

### Findings and comparison history

- [Resolved P1] The prior contour retained box-like shoulders and relatively
  flat ends. The source mesh now uses a cosine-squared waist across the full
  width, a larger three-dimensional corner radius, and smooth vertical end
  tapering. The post-fix desktop and mobile captures show one continuous
  hourglass outline without the previous rectangular transition.
- [Resolved P1] The prior all-caps mark used a faint darker stroke. The atlas
  now draws one title-case `Soap` fill at Fredoka 600 with no `strokeText`
  pass. Raising the opaque decal alpha cutoff removes the dark translucent
  fringe without changing its depth behavior under intact wax.
- [Passed] Fonts and typography: the focused comparison confirms the same
  simple one-line title-case word, a rounded sans construction, no outline,
  no wrap, and centered optical placement. Hue-matched ink remains intentional
  from the preceding approved color direction.
- [Passed] Spacing and layout rhythm: the six-item 3 x 2 desktop and 2 x 3
  mobile grids remain centered, evenly spaced, and clear of navigation.
- [Passed] Colors and visual tokens: glossy tinted coatings and tone-on-tone
  marks are unchanged.
- [Passed] Image quality and asset fidelity: the supplied crop is used only as
  typography reference; the procedural geometry and local OFL font remain
  crisp at both densities.
- [Passed] Copy/content: every item now displays exactly `Soap`.

### Interaction and regression QA

- Repeated presses on the upper-left mobile soap still create connected
  topology-driven cracks and detachable falling wax; no decorative overlay or
  alternate fracture path was introduced.
- The continuous source mesh remains finite, closed, manifold, and below the
  established mobile triangle budget. Automated checks also verify a monotonic
  waist curve and rounded shoulder taper.
- `npm run lint`, `npm run check`, `npm test` (24 files, 123 tests), and
  `npm run build` pass.
- No Supabase change or migration is required.
- Final result: passed.
