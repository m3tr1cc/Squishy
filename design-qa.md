# Design QA — cohesive dry-wax fracture

## Evidence

- Interaction reference: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\.codex-remote-attachments\019f9ef9-371e-7273-962c-a044e8110cb3\2d1f094c-6e2b-449b-839a-1f09c6a48b49\2-Photo-2.jpg`
- Butter-label reference: `C:\Users\jleon\AppData\Local\Temp\codex-clipboard-6db39867-aec5-4eda-9ee8-e957d45d9993.png`
- Desktop repeated-press state: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-desktop-long-hold-cluster6.png`
- Mobile short-tap state: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-mobile-one-tap-dwell.png`
- Mobile two-touch state: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-mobile-two-touch-cluster6-final.png`
- Mobile completed state: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-mobile-full-break-dwell-final.png`
- Mobile replay state: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-mobile-recoat-final-3.png`
- Combined reference/implementation comparison: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-fracture-v2-design-comparison-final.png`

Desktop evidence was captured at 1264 × 569 CSS pixels and mobile evidence at
390 × 844. The combined comparison places the supplied two-thumb wax-tear
reference beside a focused crop of the implemented two-touch state. The
reference includes real fingers; the app intentionally uses the user's actual
pointer or fingers as the input rather than rendering simulated hands.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The broad rounded butter silhouette, pale warm-yellow palette, dark-teal
  `4oz.`, `NET WT. (113 G)`, `SALTED`, and `BUTTER` label hierarchy match the
  supplied butter reference and remain legible at both viewports.
- Before interaction, the coating reads as one seamless, slightly glossy wax
  surface. Cracks reveal darker inner wax and real side-wall thickness instead
  of overlaying radial “flower” graphics.
- A short tap leaves a local connected fissure and lifted edge but no loose
  spawned object. Continued pressure or a repeated press can release a
  connected irregular sheet of up to six neighboring plates.
- Two simultaneous touches create two independent contact loads and merge
  cracks through the same persistent bond graph. The resulting tears remain
  part of the original shell topology.
- Repeated presses progressively consume the coating around the entire stick.
  The completed capture shows the butter exposed inside settled shell pieces,
  followed by an accessible `Re-coat wax` replay action.
- The opaque pointer-following highlight remains a desktop hover affordance.
  Touch input clears the hover light so it cannot wash out the fine mobile
  crack edges.
- The tabletop horizon, contact shadows, close camera framing, and minimal
  full-canvas composition remain stable with no clipping at the tested desktop
  or mobile sizes.

## Interaction, performance, and accessibility QA

- Mouse hold and repeated press: passed.
- Mobile short tap: passed; connected crack/peel remains and no fragment drops.
- Mobile continued press: passed; a real thick fragment can detach.
- Two concurrent mobile touches: passed.
- Thirty-four repeated 270 ms mobile presses: passed; full-shell completion,
  replay control, and zero captured runtime errors.
- Replay after full fracture: passed; the keyed scene returns to a pristine
  shell and removes the completion control.
- Local Chromium at 390 × 844: 60 fps idle, 56.8 fps average during one active
  2.5 s touch (17 ms p95), and 49.2 fps average during two active touches
  (33.4 ms p95). The one-time Rapier lazy load caused the longest sampled frame.
- Canvas has an accessible label and hidden interaction instructions.
  Completion is announced through `aria-live`; replay is a keyboard-focusable
  44 px button with a visible focus ring.
- Reduced motion removes the invitation pulse and uses a faster, restrained
  rebound.
- No error overlay, uncaught exception, or WebGL context loss remained after
  the stable capped Rapier-pool fix. Existing Three.js/Rapier deprecation
  notices are non-blocking dependency warnings.

## Comparison history

1. Replaced per-press flower/star break meshes with one deterministic 128-plate
   thick shell and a persistent neighbor-bond graph.
2. Closed each plate geometrically and collapsed attached side walls to keep
   the pristine coating visually seamless.
3. Tuned local damage, crack continuation, and low global compression fatigue
   so nearby cracks grow first while repeated interaction can eventually break
   the full 360° coating.
4. Added a locally loaded 220 ms peel dwell so a quick tap cannot immediately
   spawn a loose fragment.
5. Grouped same-frame adjacent detachments into compound sheets of up to six
   plates and baked the last rendered dent/peel pose into each rigid rest shape
   to eliminate the first-physics-frame snap.
6. Replaced mid-step Rapier body recycling with a generation-stable 24-mobile /
   40-desktop body pool after stress QA exposed a WASM ownership race.

## Deferred polish

- P3: future art direction can use larger authored region clusters if an even
  closer match to the reference's broad hand-peeled sheets is desired.
- Crack and impact audio, haptics, loose wax dust, additional squishies, saved
  progress, and analytics remain intentionally outside this implementation.

final result: passed
