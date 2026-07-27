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
