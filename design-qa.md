# Design QA — thick wax break and butter decals

## Evidence

- Source interaction truth: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\.codex-remote-attachments\019f9ef9-371e-7273-962c-a044e8110cb3\d2ec3720-290a-459b-99a4-8bc3bd954351\1-Photo-1.jpg`
- Source label truth: `C:\Users\jleon\AppData\Local\Temp\codex-clipboard-6db39867-aec5-4eda-9ee8-e957d45d9993.png`
- Desktop implementation: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-crack-final-desktop.png`
- Mobile implementation: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-crack-final-mobile.png`
- Combined comparison: `C:\Users\jleon\Documents\Codex\2026-07-26\inspect-the-existing-codefair-project-and\work\squishy-design-qa-comparison.png`

The source interaction image is 1071 × 757 pixels. The implementation was
captured at 1264 × 569 CSS pixels on desktop and 390 × 844 CSS pixels on
mobile, both at browser screenshot density. The combined comparison normalizes
the interaction source and desktop implementation into adjacent 700 × 500
cells. The state compared is one completed surface press with the wax plates
lifted and the crack remaining visible after rebound.

The crack is large enough in the normalized full-view comparison to judge the
plate faces, lifted inner edges, side thickness, center opening, radial
fissures, and label occlusion, so a separate focused crop was not needed.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Typography follows the supplied butter reference: condensed dark-teal
  `4oz.`, `NET WT. (113 G)`, `SALTED`, and `BUTTER` groups with the same
  left/right hierarchy.
- Layout preserves the close tabletop framing and keeps the label centered on
  the broad front face at desktop and mobile sizes.
- The shell, lifted plates, and exposed center use related warm-yellow tokens;
  darker brown fissures provide enough contrast without reading as a black
  puncture.
- The lifted wax pieces are real two-sided 3D geometry with visible side walls
  and shadows, rather than a flat crack graphic. Their stylized radial
  arrangement intentionally abstracts the two-finger tear in the source into a
  location-independent single-tap interaction.
- The generated label and crack textures remain sharp at both captured sizes.
  No transparency halos, clipped type, or z-fighting were visible.
- Copy matches the supplied label reference. No additional UI copy competes
  with the object.

## Comparison history

1. Initial implementation lost mobile taps when pointer-out cleared the pending
   touch. Pointer capture was added, pointer-out no longer clears the tap, and
   movement/duration qualification still protects vertical scrolling.
2. The first label plane intercepted shell raycasts, so a click produced only
   shine and placed break data in the label's coordinate space. All decorative
   label, fissure, and shard meshes now opt out of raycasting; the shell remains
   the sole interaction surface.
3. The first exposed center read as a dark puncture. It was changed to a warm
   inner-butter gold while retaining darker fissure lines.
4. Post-fix evidence: the desktop screenshot shows the lifted thick plates and
   persistent crack over the label; the mobile screenshot was produced by
   dispatching a touch pointer down/up sequence and shows the same committed
   break.

## Interaction and browser QA

- Mouse press: passed.
- Mobile touch pointer press: passed.
- Tap-vs-scroll movement and long-press qualification: covered by unit tests.
- Persistent crack after spring rebound: passed.
- Label remains visible before impact and is naturally occluded by broken wax:
  passed.
- Browser console errors: none. Three.js emits its existing non-blocking Clock
  deprecation warning.

## Follow-up polish

- P3: future cracking work can add more shard silhouettes and per-impact crack
  textures for greater natural variation.
- Detached fragment physics and sound remain intentionally deferred.

final result: passed
