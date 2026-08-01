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

## Clicker inner-groove outline refinement

### Evidence and normalization

- Source visual truth:
  `C:\Users\jleon\AppData\Local\Temp\codex-clipboard-40b16117-b5ce-4a3f-b6a8-efb514736382.png`
  at 706 x 850 pixels. The red annotation marks the requested groove outline.
- Browser-rendered implementation:
  `qa/clicker-inner-groove-final.png` at 706 x 850 pixels, captured from a
  706 x 850 CSS viewport at DPR 1 on `/clicker?qaDpr=1`.
- Equal-size full-view comparison:
  `qa/clicker-inner-groove-comparison.png` at 1412 x 850 pixels. Source and
  implementation occupy equal 706 x 850 slots with no crop, scaling, or
  stretching.
- State: idle clicker after the scene settled, with matching route controls.

The inner groove is large and clearly visible around the full key field in the
equal-size comparison, so an additional focused crop was unnecessary.

### Findings and comparison history

- [Resolved P2] The previous groove plate used the general deformed-cuboid
  helper, which produced stepped corners and made the inner edge look unrelated
  to the molded housing. The revised groove uses the same rounded-box geometry
  family as the outer shell with continuous supplied normals.
- [Resolved P2] The previous corner value was independent of the housing
  outline. The groove is now a precise 0.25-unit inset on all four sides, and
  its 0.09-unit radius is derived as `housing radius - inset`. The resulting
  corner centers and straight runs are concentric with the outer housing and
  closely follow the supplied red guide.
- [Passed] Fonts and typography: no visible type or navigation treatment was
  changed.
- [Passed] Spacing and layout rhythm: key centers, wells, rim width, product
  framing, and controls are unchanged. The groove remains evenly inset around
  the complete 3 x 3 field.
- [Passed] Colors and visual tokens: white plastic, the neutral groove surface,
  key palette, lighting, shadow, and background animation remain unchanged.
- [Passed] Image quality and asset fidelity: the groove remains procedural
  WebGL geometry with a continuous rounded silhouette and no raster overlay,
  drawn annotation, post-processing, or fake edge treatment.
- [Passed] Copy and content: route title, instructions, navigation labels, and
  audio behavior are unchanged.

### Interaction, responsiveness, and performance

- A center-key pointer press still depressed and released the correct key and
  triggered the shared background burst. The page retained exact 706 x 850
  dimensions with no overflow or Vite error overlay.
- The revised scene reports 18 draw calls and 11,871 rendered triangles, below
  the existing 12,000 clicker budget. Steady-state frames remained primarily
  16.4-17.2 ms; browser-automation capture pauses were excluded.
- Fresh browser logs contained no application-owned error. The existing
  upstream `THREE.Clock` deprecation warning remains non-blocking.
- No dependency, persistence, backend, or Supabase migration was added.

final result: passed

## Thocky clicker page

### Source and implementation evidence

- Supplied source: `.codex-remote-attachments/019fbafe-a680-7d23-965c-c934de7e3da5/0f31554a-c280-4afe-a385-0d2424954548/1-Photo-1.jpg`
  at 591 x 1280 pixels.
- Desktop implementation: `qa/clicker-desktop-idle.png`.
- Mobile idle and active states: `qa/clicker-mobile-idle.png` and
  `qa/clicker-mobile-pressed.png`, captured at 390 x 844 CSS pixels, DPR 1.
- Focused source and implementation crops: `qa/clicker-reference-product.png`
  and `qa/clicker-mobile-product.png`.
- Normalized focused comparison: `qa/clicker-reference-comparison.png`, with
  each clicker aspect-fit into an equal 500 x 500 slot without stretching.

The focused comparison excludes the source video's phone chrome, hands, and
surrounding props because the product target is the clicker itself. It compares
the square white housing, inset 3 x 3 key grid, row palette, cap proportions,
and glossy highlight language directly.

### Findings and comparison history

- [Resolved P2] The first procedural pass exceeded the planned 12,000-triangle
  product budget. Rounded-box segment counts were reduced without changing the
  silhouette; the final scene reports 18 draw calls and 9,603 rendered
  triangles in the mobile diagnostic pass.
- [Resolved P2] The initial key palette and corners read flatter and less jelly
  like than the supplied source. Yellow, pink, and blue saturation was raised,
  the cap radius was increased, and the physical material retained clearcoat,
  low roughness, and broad studio highlights.
- [Passed] Fonts and typography: the full-frame product adds no visible display
  typography. The route heading and instruction remain available to assistive
  technology, and existing navigation labels are unchanged.
- [Passed] Spacing and layout rhythm: the white housing remains centered and
  fully visible at 1440 x 900, 844 x 390, 390 x 844, and 280 x 560. The grid,
  rim, wells, and row spacing match the source hierarchy without clipping or
  colliding with navigation.
- [Passed] Colors and visual tokens: the final top, middle, and bottom rows are
  warm pastel yellow, glossy pink, and clear cyan-blue in a neutral white
  housing. The shared background starts quiet and uses the same palette for a
  brief press-triggered burst.
- [Passed] Image quality and asset fidelity: housing, wells, stems, and caps are
  procedural WebGL geometry with physical materials and real lighting. No
  raster product replacement, CSS key drawing, post-processing, or copied
  video frame ships with the page.
- [Passed] Copy and content: the fourth route is `Thocky clicker`; its hidden
  instruction describes pressing any of nine keys, the mechanical sound, and
  the background response.
- [Passed] Interaction and accessibility: mouse and touch presses use pointer
  capture, scroll cancellation, a two-touch cap, and independent key springs.
  Short taps remain visibly depressed for at least 70 ms. Reduced motion keeps
  immediate shallow travel without rebound overshoot.

### Browser, audio, and performance QA

- Portrait mobile, narrow mobile, landscape, and desktop layouts passed with no
  overflow or obscured navigation.
- Top, middle, and bottom-row clicks each depressed the targeted key and emitted
  a shared synesthesia burst. The burst settled back to the calm field.
- The previous-page control navigated from `/clicker` to `/chocolate` with the
  QA query preserved, and direct return to `/clicker` restored the experience.
- A real Chromium pointer gesture unlocked Web Audio. Three rapid key presses
  produced two audible sample starts and one intentional rate-limit skip;
  diagnostics ended `ready` with playback-rate variation at `0.955`.
- The final mobile diagnostic reported 18 draw calls and 9,603 rendered
  triangles. Frame samples were predominantly 16.6-16.8 ms, with a sampled
  maximum of 18.4 ms.
- No dependency, persistence, backend, Rapier usage, or Supabase migration was
  added for this page. The thock sample and CC BY 4.0 attribution are committed
  under `audio/`.

### Remaining polish

- P3: the procedural caps are intentionally more uniform than the handmade
  jelly-keycap irregularity in the source. This preserves deterministic shared
  geometry, instancing, and the verified mobile render budget.

final result: passed

## Cross-page synesthesia propagation and two-second response

### Source and implementation evidence

- The original active-state visual comparison remains
  `qa/chocolate-synesthesia-active-comparison.png`, with the local
  Ratatouille frame reference on the left and the procedural chocolate
  implementation on the right.
- Fresh in-app browser captures were inspected for butter, soap, and
  chocolate at 1440 x 900 and 390 x 844, DPR 1.
- Butter selected one of its three body colors as the lead and used its
  paired complement. Soap selected one of its six body colors and its
  paired complement. The selection stayed stable within each session.
- Active physical-fracture captures were inspected for all three pages.
  Butter reported one active motif, soap five, and chocolate six after
  real bond-break events; a press without a chocolate bond break raised
  flow speed without introducing a motif.

### Findings and comparison history

- [Resolved P1] The original black butter ground plane covered the lower
  half of the new procedural field. The non-physical visual plane was
  removed; the existing static debris collider remains unchanged, and
  the synesthesia field now fills the complete frame.
- [Passed] The same blurred patch field, dark pockets, contours, ribbons,
  and seeded motifs are shared by all pages without duplicating shader or
  fracture code.
- [Passed] Butter and soap palettes use explicit lead/complement pairs
  sourced from their real body-color catalogs. Session-seeded selection
  provides random variety without changing colors during animation.
- [Passed] Fonts, copy, navigation placement, completion controls, object
  geometry, lighting, and interaction targets remain unchanged.
- [Passed] Every effect remains behind products and debris. No motif or
  field layer blocks pointer or touch interaction.

### Timing, responsive, and regression QA

- Motif lifetime is now 2 seconds and burst energy uses a 0.35-second
  half-life. Fresh diagnostics showed zero active motifs and near-ambient
  flow after a 2.3-second post-fracture wait on soap and chocolate.
- Butter, soap, and chocolate retained `clientWidth == scrollWidth` and
  `clientHeight == scrollHeight` at 390 x 844, with no viewport cropping,
  overflow, navigation collision, or aspect distortion.
- The fixed signal mixer preserved active presses from any of the three
  butter or six soap instances, averaged cumulative page damage, and
  advanced bursts only when a source's real crack sequence changed.
- Fresh browser inspection found no Vite overlay or application-owned
  console error. Reduced-motion timing and static motif suppression remain
  covered by deterministic unit tests.
- No dependency or Supabase migration was added.

final result: passed

## Chocolate synesthesia background

### Source and implementation evidence

- Source visual truth:
  `Ratatouille Tastes Food/frame_000571.png` and
  `Ratatouille Tastes Food/frame_000590.png`, each 1280 x 720 pixels.
  These film frames are local, untracked inspiration for the blurred field,
  large ribbons, spirals, and contour-line motion; they are not shipped.
- Desktop idle implementation:
  `qa/chocolate-synesthesia-desktop-idle.png` at 1440 x 900 pixels,
  CSS viewport 1440 x 900.
- Desktop active implementation:
  `qa/chocolate-synesthesia-desktop-multi-crack.png` at 1440 x 900 pixels,
  captured immediately after real chocolate bond breaks.
- Mobile implementation:
  `qa/chocolate-synesthesia-mobile-idle.png` and
  `qa/chocolate-synesthesia-mobile-crack.png` at 390 x 844 pixels,
  CSS viewport 390 x 844.
- Full-view comparisons:
  `qa/chocolate-synesthesia-idle-comparison.png` and
  `qa/chocolate-synesthesia-active-comparison.png`, normalized to a
  common 720-pixel height without crop or stretch.
- Focused-region comparison was not needed: the change is a full-frame
  procedural background, while the chocolate geometry, controls, copy, and
  typography remain unchanged and are legible in the full-view captures.

The comparison evaluates visual grammar rather than literal composition: the
reference contains a character and food, while Squishy intentionally keeps
all synesthesia shapes behind the interactive chocolate bar.

### Findings and comparison history

- [Resolved P1] The first browser pass advanced the animation state without
  displaying crack motifs because the mounted shader material had cloned its
  uniform object. The renderer now writes scalar and fixed `Vector4` motif
  uniforms directly into the mounted material on every frame.
- [Resolved P1] The first active pass produced too many repeating contour
  lines. The final shader uses a one-arm spiral, lower-frequency contours,
  edge-anchored motif slots, broader ribbons, and a short darkening pulse so
  the crack state reads as a composed burst rather than visual noise.
- [Resolved P2] An opaque screen quad participated in Three.js's transmission
  prepass and added two draw calls. The final depth-tested transparent quad
  remains visually behind the chocolate while adding exactly one draw call.
- [Resolved P2] A temporary development-only render-list diagnostic could
  read a cleared list during hot reload. That probe was removed; fresh final
  desktop and mobile sessions report zero application-owned console errors.
- [Passed] Fonts and typography: no visible text style or font changed.
- [Passed] Spacing and layout rhythm: the canvas, camera, product framing,
  navigation placement, and safe areas remain unchanged. The 390 x 844 page
  has no horizontal or vertical overflow.
- [Passed] Colors and visual tokens: the field uses filling-led `#a9ef75`,
  complementary `#ef5b62`, and deep chocolate-neutral `#160a08`. The intact
  bar retains a clear silhouette in both calm and active states.
- [Passed] Image quality and asset fidelity: the animation is procedural
  WebGL, aspect-correct, and free of copied frames, raster overlays,
  handcrafted SVGs, post-processing, or visible scaling artifacts.
- [Passed] Copy, content, icons, and controls: the route title, instruction,
  crack audio, navigation arrows, completion state, and `Re-form chocolate`
  action are unchanged.
- [Passed] Accessibility: reduced-motion tests freeze flow time, clear active
  motifs, and retain damage-driven static color state.

### Interaction, responsiveness, and performance

- Desktop and mobile presses were exercised through pristine, first-crack,
  multi-crack, and post-burst settling states. Only actual bond-break batches
  advanced the motif sequence; ordinary pressure accelerated the field
  without creating a fake crack burst.
- A clean 239-frame mobile sample held the same 16.7 ms median frame time and
  improved p95 from 17.0 ms to 16.9 ms within sampling noise. The background
  changed the pristine scene from 3 to 4 draw calls and contributes one
  full-screen triangle.
- Direct data-URL iframe construction was blocked by the in-app browser's URL
  safety policy. The implementation adds no DOM overlay or top-level sizing
  assumption and stays inside the existing full-frame canvas; the verified
  390 x 844 no-overflow result and existing iframe architecture are preserved.
- Automated tests cover palette validation, deterministic bounded motif
  selection, press-only acceleration, real-break sequencing, monotonic
  damage escalation, burst decay, reset, and reduced motion.
- No dependency, persistence, backend, or Supabase migration was added.

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

## Fully rounded outer contour

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/d7719999-0b9a-4340-917a-03c9808d1b99/1-Photo-1.jpg`
  at 1200 x 960 pixels.
- Desktop implementation: `qa/soap-rounded-contour-desktop.png` at
  1440 x 900, CSS viewport 1440 x 900, DPR 1.
- Mobile implementation: `qa/soap-rounded-contour-mobile.png` at
  390 x 844, CSS viewport 390 x 844, DPR 1.5 with CSS-pixel-normalized
  capture.
- Mobile cracked state: `qa/soap-rounded-contour-mobile-cracked.png` at
  390 x 844 with the same viewport and normalization.
- Equal-height focused comparison:
  `qa/soap-rounded-contour-comparison.png` at 1200 x 600.

### Findings and comparison history

- [Resolved P1] The first rounding pass still produced short vertical end
  segments. Increasing only the end taper overcorrected into a pointed,
  diamond-like midpoint. The final implementation replaces that approximation
  with a continuous two-axis squircular mapping.
- [Passed] Post-fix evidence shows fully convex end caps, broad rounded lobes,
  and a soft central waist closely matching the red traced source contour.
  There is no bevel-to-side corner or pointed side midpoint.
- [Passed] Typography, color, wax transmission, grid spacing, and copy remain
  unchanged from the previously approved pass.
- [Passed] The same shaped source feeds the inner body, decal, wax topology,
  previews, dents, and raycasting; the visual fix is not a separate shell or
  overlay.

### Interaction and regression QA

- Six repeated mobile presses on the upper-left soap still produced connected
  cracks and detachable wax across the rounded contour.
- Automated geometry checks cover the rounded top shoulder, half-height side
  curvature, monotonic waist, closed manifold output, and existing triangle
  budget.
- `npm run lint`, `npm run check`, `npm test` (24 files, 123 tests), and
  `npm run build` pass.
- No Supabase change or migration is required.
- Final result: passed.

## Softened lobe peaks

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/0dc98d30-a316-4025-ae4b-556bf59ceca0/1-Photo-1.jpg`
  at 1280 x 952 pixels.
- Desktop implementation: `qa/soap-soft-lobes-desktop.png` at
  1920 x 911.
- Mobile implementation: `qa/soap-soft-lobes-mobile.png` at
  390 x 844.
- Mobile interaction state:
  `qa/soap-soft-lobes-mobile-interaction.png` at 390 x 844.
- Focused side-by-side comparison:
  `qa/soap-soft-lobes-comparison.png` at 1200 x 620.

### Findings and comparison history

- [Resolved P1] The four outer lobe peaks read as slightly angular at the
  points marked in the supplied reference. The shared source mesh now
  concentrates more of its fixed triangle budget along the horizontal
  contour, increasing width resolution from 36 to 41 segments.
- [Resolved P1] The waist pull is reduced from 25% to 21%, and the continuous
  squircular shoulder projection is slightly stronger. Together these changes
  turn the four peak transitions into broad arcs while preserving the approved
  hourglass waist and convex ends.
- [Passed] The same revised source geometry drives the colored core, wax
  topology, decal, deformation, and raycasting. No cosmetic overlay or
  alternate interaction mesh was introduced.
- [Passed] Typography, glossy tinted wax, six-soap layout, sound, debris, and
  navigation remain unchanged.

### Interaction and regression QA

- Desktop and 390 x 844 portrait captures show the broader four-lobe contour
  without clipping, overlap, or navigation collisions.
- Mobile press QA retains the existing zoom response and topology-driven wax
  interaction after the smoothing change.
- Automated geometry coverage locks the 41 x 14 x 3 segment distribution,
  the softened crest profile, the closed manifold, and the 3,000-triangle
  mobile budget.
- No Supabase change or migration is required.
- Final result: passed.

## Chocolate slime experience

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/9efcbaf9-f32c-42c6-90a7-6800ff0be2af/1-Photo-1.jpg`,
  `2-Photo-2.jpg`, and `3-Photo-3.jpg`, each at 1280 x 591 pixels.
- Desktop intact implementation:
  `qa/chocolate-desktop-fresh.png` at 1440 x 900, CSS viewport
  1440 x 900, DPR 1.
- Desktop cracked implementation:
  `qa/chocolate-desktop-cracked-fresh.png` at 1440 x 900 with the
  same viewport and density.
- Repeated-press implementation:
  `qa/chocolate-desktop-multi-crack.png` at 1440 x 900 after four
  additional presses and a 2.2 second debris-settle interval.
- Mobile intact and cracked implementation:
  `qa/chocolate-mobile.png` and `qa/chocolate-mobile-cracked.png` at
  390 x 844, CSS viewport 390 x 844, requested DPR 1.5.
- Equal-size full-view comparisons:
  `qa/chocolate-reference-comparison.png` and
  `qa/chocolate-cracked-comparison.png`, each at 1440 x 450. Source
  and implementation were independently aspect-fit into equal 720 x 450
  black frames before comparison, avoiding density or crop bias.

### Findings and comparison history

- [Passed] The intact comparison shows one continuous glossy dark-chocolate
  bar with the requested 5 x 3 raised-cell grid, recessed gutters, soft outer
  corners, and restrained specular highlights. The procedural bar is more
  pillowy than the molded reference, which is an intentional tactile
  interpretation rather than a hierarchy or geometry mismatch.
- [Passed] The cracked comparison confirms that breakage belongs to the
  chocolate surface itself. Smaller connected fragments peel away to reveal
  the contrasting pale-green filling; there is no press-specific decal,
  replacement mesh, or flat color overlay.
- [Passed] The filling depresses at contact, spreads tangentially around the
  press, rebounds slowly, and retains an 18% accumulated deformation residue
  until `Re-form chocolate` resets the experience. Attached chocolate follows
  the same displacement field before detached fragments transition to Rapier.
- [Passed] Fonts and typography: the source provides no product label to
  reproduce. The existing hidden heading, navigation status, and accessible
  button copy use the established application type stack without introducing
  a new visible typography system.
- [Passed] Spacing and layout rhythm: both 1440 x 900 and 390 x 844 keep the
  wide bar centered, fully visible, and clear of the top-right navigation.
  Straight-on camera framing preserves equal cell widths and horizontal rows.
- [Passed] Colors and visual tokens: near-black presentation, glossy
  `#3a160f` chocolate, darker broken edges, and `#a9ef75` slime preserve the
  reference's dark-shell/light-filling contrast while implementing the
  requested green filling.
- [Passed] Image quality and asset fidelity: the reference was used as visual
  truth only; the final bar is a closed procedural surface with smooth normals
  and no raster stretching, placeholder imagery, sorting halo, or visible
  background seam.
- [Passed] Copy/content: the third route is titled `Chocolate slime`, the
  hidden instruction describes cracking and spreading, and completion exposes
  the specific `Re-form chocolate` action.
- No P0, P1, or P2 difference was found in the first normalized comparison, so
  no visual correction iteration was required. Focused crops were unnecessary:
  the geometry, specular surface, crack opening, and filling contrast are all
  clearly readable in the equal-height full-view comparisons.

### Interaction, responsive, and performance QA

- A 300 ms desktop hold produced a local connected opening; four additional
  presses extended the fracture across neighboring cells while detached
  fragments fell and retired without a WebGL or Rapier error.
- A 260 ms mobile press at 390 x 844 produced the same local chocolate crack
  and exposed green filling without layout movement, blue tap highlighting,
  or navigation activation.
- Fresh desktop and mobile browser sessions reported zero uncaught page
  errors. Console inspection found only the existing Rapier initialization
  deprecation warning after debris first loaded.
- The mobile 300-frame diagnostic sample averaged 60.0 FPS with a 17.1 ms
  p95 frame time, 3 draw calls, and 61,504 rendered triangles.
- Deterministic tests cover the 15-cell closed mesh, 12,000-source-triangle
  budget, 72 connected chocolate plates, gutter toughness bias, bounded slime
  displacement, 18% residue, camera framing, debris colliders, and three-page
  non-wrapping navigation.
- `npm run lint`, `npm run check`, `npm test` (28 files, 133 tests), and
  `npm run build` pass.
- No Supabase change or migration is required.
- final result: passed

## Permanent slime displacement refinement

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/1-Photo-1.jpg`
  at 1280 x 591 pixels. The supplied image shows the substantially displaced,
  broken chocolate state used as the interaction target.
- Intact companion reference:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/2-Photo-2.jpg`
  at 1280 x 591 pixels.
- Desktop implementation at three seconds after release:
  `qa/chocolate-slime-permanent-desktop-3s.png`.
- Desktop implementation at seven seconds after release:
  `qa/chocolate-slime-permanent-desktop-7s.png`.
- Mobile interaction state:
  `qa/chocolate-slime-permanent-mobile-7s.png`.
- Equal-slot combined comparison:
  `qa/chocolate-slime-permanent-comparison.png` at
  1440 x 450 pixels.
- Desktop CSS viewport and capture: 1440 x 900 at DPR 1.
- Mobile CSS viewport and capture: 390 x 844 at DPR 1.
- State: three nearby presses followed by a seven-second release interval.
  Source and implementation were aspect-fit into separate 720 x 450 black
  frames so neither state was stretched or cropped.

The full-view comparison was sufficient for this iteration because the
requested evidence is the overall post-break silhouette, filling displacement,
and shell coupling. The opening, attached chocolate pieces, green filling, and
remaining 5 x 3 grid are all readable at the normalized comparison size.

### Findings and comparison history

- [Resolved P1] The previous chocolate implementation drove released impacts
  back toward an 18% residue, which made the filling feel springy and rigid.
  Chocolate presses now become plastic deformations on release: their
  displacement amount is retained, velocity is cleared, and the impact remains
  in the filling field until `Re-form chocolate` resets the experience.
- [Resolved P1] The previous deformation was primarily an inward dent. The
  revised field creates a deeper pocket, a wider tangential spread, a raised
  volume-preserving outer ridge, and gravity-biased sag. The maximum bounded
  displacement increases from 0.30 to 0.48 model units.
- [Resolved P1] Peeling chocolate used a rest-space pivot, which could make a
  still-connected shard appear to float over the moving filling. Each plate
  pivot now samples the same persistent slime field as its vertices. Attached
  seams remain coincident, peeling pieces travel with the filling, and only
  detached pieces transition to Rapier gravity.
- [Passed] The three-second and seven-second mobile captures are pixel
  identical, confirming that the visible post-release shape does not rebound.
  Desktop captures retain the same displaced opening; small pixel changes are
  limited to the continuously rendered glossy scene.
- [Passed] The normalized comparison now reads as a displaced, slime-filled
  chocolate bar: the green filling spreads beyond the pressed pocket and
  chocolate pieces remain carried around the opening instead of immediately
  falling independently.
- [Passed] Fonts and typography: no visible product typography changed. Hidden
  route heading, instructions, and navigation copy remain unchanged.
- [Passed] Spacing and layout rhythm: the existing straight-on 5 x 3 framing
  remains centered at both target viewports, with navigation unobstructed.
- [Passed] Colors and visual tokens: glossy dark chocolate, pale-green slime,
  and the seamless black environment are unchanged.
- [Passed] Image quality and asset fidelity: both filling and shell remain
  procedural WebGL geometry. No deformation decal, replacement mesh, or
  rasterized damage layer was introduced.
- [Passed] Copy/content: `Chocolate slime`, its interaction instruction, crack
  sounds, and `Re-form chocolate` behavior remain intact.

### Interaction and regression QA

- Desktop and mobile pointer presses produced connected shell fractures and
  retained the resulting slime shape after release.
- Still-attached and peeling chocolate visibly follow the persistent filling
  field; detached fragments retain the existing gravity and fade lifecycle.
- Browser inspection found no Vite overlay, WebGL loss, or application-owned
  console error. Chrome-extension warnings and the existing upstream
  `THREE.Clock` deprecation warning were excluded from application findings.
- Focused automated coverage verifies permanent release state, volume ridge and
  sag, bounded displacement, exact attached-shell coupling, and displaced peel
  pivots.
- No dependency or Supabase migration was added.

final result: passed

## Unbounded slime silhouette refinement

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/1-Photo-1.jpg`
  at 1280 x 591 pixels. The broken reference shows the filling and carried
  chocolate forming a silhouette that no longer follows the pristine bar.
- Intact companion reference:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/2-Photo-2.jpg`
  at 1280 x 591 pixels.
- Desktop expanded implementation:
  `qa/chocolate-slime-unbounded-after-more.png` at 1440 x 900,
  CSS viewport 1440 x 900, DPR 1.
- Mobile expanded implementation:
  `qa/chocolate-slime-unbounded-mobile-after.png` at 390 x 844,
  CSS viewport 390 x 844, DPR 1.
- Source/implementation comparison:
  `qa/chocolate-slime-unbounded-comparison.png` at 1440 x 450.
- Pristine/expanded implementation comparison:
  `qa/chocolate-slime-unbounded-before-after.png` at 1440 x 450.
- State: six nearby lower-region presses followed by 3.5 seconds of settling
  on desktop; three center presses followed by the same settling interval on
  mobile. Each comparison slot is 720 x 450 with proportional aspect-fit and
  no crop or stretch.

A full-view reference comparison and a same-camera before/after comparison were
both required. The reference comparison establishes the intended displaced
material character; the before/after comparison proves that the final silhouette
extends below the pristine bar instead of merely changing shading inside its
original rectangle.

### Findings and comparison history

- [Resolved P1] The prior volume spread was multiplied by the local vertex
  normal alignment. Front vertices moved, but the rounded sidewall and perimeter
  vertices were effectively pinned to the source rectangle. The revised flow
  separates front-face indentation from thickness-aware volume transport.
- [Resolved P1] A 3.6-unit projected flow radius now carries front and near-side
  vertices radially away from the impact and adds gravity-biased sag. A
  0.58-unit depth coupling keeps the motion within the front volume and prevents
  deformation from appearing on the opposite face.
- [Resolved P1] Maximum accumulated displacement increases from 0.48 to 0.78
  model units. The desktop post-fix capture shows the filling and bonded
  chocolate extending below the intact right-hand baseline, while the mobile
  capture retains the altered silhouette without clipping.
- [Resolved P2] The old geometry bounds and camera fit were sized around the
  pristine bar. Chocolate now uses conservative dynamic raycast bounds, and the
  responsive camera reserves 4.05 x 2.42 half-extents for post-break expansion.
  Expanded material remains touchable and visible at both target viewports.
- [Passed] Attached and peeling chocolate still samples the same deformation
  field as the filling. Only fully detached fragments transition to Rapier,
  gravity, and the existing timed fade.
- [Passed] Fonts and typography: no visible typography was added or changed.
  The hidden route heading, instructions, and navigation labels remain intact.
- [Passed] Spacing and layout rhythm: the pristine bar remains centered and
  straight-on; the slightly wider safety framing is applied consistently on
  desktop and portrait mobile.
- [Passed] Colors and visual tokens: glossy dark chocolate, pale-green slime,
  black background, and neutral navigation retain the approved palette.
- [Passed] Image quality and asset fidelity: expansion is performed on the
  existing procedural closed meshes. No clip mask, raster overlay, duplicate
  filling, or fake overflow graphic was introduced.
- [Passed] Copy/content: interaction instructions, crack audio, completion, and
  `Re-form chocolate` are unchanged.

### Interaction and regression QA

- Desktop lower-edge presses created a permanent lobe beyond the pristine bar
  boundary while bonded shell pieces followed it.
- Mobile center presses retained the wider volume field, stayed inside the
  responsive frame, and produced no blue tap highlight or navigation collision.
- Browser inspection found no Vite overlay, WebGL loss, or application-owned
  console error. Chrome extension message-channel noise and the existing
  upstream `THREE.Clock` deprecation warning were excluded.
- Automated coverage verifies sidewall displacement beyond the original filling
  bounds, conservative dynamic bounds, expanded-shell coupling, opposite-face
  isolation, displacement limits, and desktop/mobile camera fit.
- The change adds no dependency and requires no Supabase migration.

final result: passed

## Half-strength chocolate deformation tuning

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/1-Photo-1.jpg`
  at 1280 x 591 pixels.
- Half-strength desktop state:
  `qa/chocolate-slime-half-strength-desktop.png` at 1440 x 900,
  CSS viewport 1440 x 900, DPR 1.
- Half-strength mobile state:
  `qa/chocolate-slime-half-strength-mobile.png` at 390 x 844,
  CSS viewport 390 x 844, DPR 1.
- Source/half-strength comparison:
  `qa/chocolate-slime-half-strength-reference-comparison.png` at
  1440 x 450.
- Previous full-strength/current half-strength comparison:
  `qa/chocolate-slime-full-vs-half-strength.png` at 1440 x 450.
- State: six nearby lower-region desktop presses and three center mobile
  presses, each followed by a 3.5-second settling interval. Comparison slots
  are equal 720 x 450 aspect-fit frames without crop or stretch.

The full-strength and half-strength screenshots use different random coating
seeds, so individual crack edges are intentionally not compared one-for-one.
The same camera, press count, press region, and settle time make the overall
mesh displacement and retained silhouette directly comparable.

### Findings and comparison history

- [Resolved P1] The unbounded-flow pass allowed the lower-left quarter of the
  bar to collapse into one large hanging lobe after six presses. The focused
  comparison shows the tuned version retaining recognizable rows and gutters
  outside the genuinely fractured contact area.
- [Resolved P1] Every displacement amplitude is exactly halved while its
  influence radius is unchanged: indentation depth `0.42 -> 0.21`, tangent
  spread `0.34 -> 0.17`, ridge height `0.14 -> 0.07`, local sag
  `0.12 -> 0.06`, volume flow `0.50 -> 0.25`, volume sag `0.24 -> 0.12`,
  and accumulated displacement cap `0.78 -> 0.39`.
- [Passed] The lower silhouette still crosses the pristine chocolate baseline,
  preserving the requested unconstrained slime behavior. The reduction affects
  magnitude, not reach, permanence, or thickness coupling.
- [Passed] Attached and peeling chocolate still follows the filling field.
  Detached shards retain the existing Rapier gravity and fade lifecycle.
- [Passed] Fonts and typography: unchanged; no new visible text or typography
  treatment was introduced.
- [Passed] Spacing and layout rhythm: camera, product position, navigation,
  and desktop/mobile safe areas are unchanged from the approved unbounded pass.
- [Passed] Colors and visual tokens: glossy chocolate, green filling, black
  background, and neutral navigation remain unchanged.
- [Passed] Image quality and asset fidelity: the result remains procedural
  geometry with no clip mask, duplicate mesh, raster overlay, or fake overflow.
- [Passed] Copy/content: interaction instructions, audio, completion, and
  `Re-form chocolate` remain unchanged.

### Interaction and regression QA

- Six desktop presses produced a localized permanent deformation without
  folding the entire bar into the contact region.
- Three mobile presses preserved the grid silhouette, exposed the filling,
  and caused no viewport highlight, clipping, or navigation collision.
- Browser inspection found no Vite overlay, WebGL loss, or application-owned
  console error. The existing Rapier initialization and `THREE.Clock`
  deprecation warnings remain dependency-owned and non-blocking.
- Automated coverage continues to verify sidewall overflow beyond the original
  filling bound, back-face isolation, attached-shell coupling, bounded
  displacement, and responsive camera fit at the reduced amplitudes.
- No dependency or Supabase migration was added.

final result: passed

## Quarter-strength chocolate deformation tuning

### Source and implementation evidence

- Source visual truth:
  `.codex-remote-attachments/019f9ef9-371e-7273-962c-a044e8110cb3/1acf110d-81e4-44d4-909f-0daac7289106/1-Photo-1.jpg`
  at 1280 x 591 pixels.
- Quarter-strength desktop state:
  `qa/chocolate-slime-quarter-strength-desktop.png` at 1440 x 900,
  CSS viewport 1440 x 900, DPR 1.
- Quarter-strength mobile state:
  `qa/chocolate-slime-quarter-strength-mobile.png` at 390 x 844,
  CSS viewport 390 x 844, DPR 1.
- Source/current comparison:
  `qa/chocolate-slime-quarter-strength-reference-comparison.png` at
  1440 x 450.
- Previous half-strength/current quarter-strength comparison:
  `qa/chocolate-slime-half-vs-quarter-strength.png` at 1440 x 450.
- State: six nearby desktop presses and three center mobile presses, each
  followed by a 3.5-second settling interval. Comparison slots are equal
  720 x 450 aspect-fit frames without crop or stretch.

The previous and current captures use different deterministic coating seeds,
so exact crack edges are intentionally not compared one-for-one. The same
camera, press count, interaction region, and settle interval make the overall
retained displacement directly comparable.

### Findings and comparison history

- [Resolved P1] The merged half-strength profile still displaced neighboring
  chocolate rows more than desired after repeated presses. The current capture
  keeps the deformation shallow and local while preserving an exposed slime
  opening and permanent post-release shape.
- [Resolved P1] Every displacement amplitude is reduced by exactly 75% from
  the merged profile: indentation depth `0.21 -> 0.0525`, tangent spread
  `0.17 -> 0.0425`, ridge height `0.07 -> 0.0175`, local sag
  `0.06 -> 0.015`, volume flow `0.25 -> 0.0625`, volume sag
  `0.12 -> 0.03`, and accumulated displacement cap `0.39 -> 0.0975`.
- [Passed] Influence radii are unchanged, so slime movement still reaches the
  rounded perimeter and is not clipped to the pristine rectangular footprint.
- [Passed] Attached and peeling chocolate continues sampling the same filling
  field. Detached shards retain their existing Rapier gravity and fade.
- [Passed] Fonts and typography: no visible typography changed.
- [Passed] Spacing and layout rhythm: camera, product framing, navigation, and
  responsive safe areas remain unchanged.
- [Passed] Colors and visual tokens: glossy chocolate, green filling, seamless
  black background, and neutral controls remain unchanged.
- [Passed] Image quality and asset fidelity: the result remains procedural
  closed geometry without a clipping mask, duplicate filling, or raster effect.
- [Passed] Copy/content: instructions, crack audio, completion, and
  `Re-form chocolate` behavior remain unchanged.

### Interaction and regression QA

- Six desktop presses produced a contained permanent opening without folding
  adjacent chocolate rows into the contact region.
- Three mobile presses retained the bar silhouette, exposed the filling, and
  caused no viewport highlight, clipping, or navigation collision.
- Browser inspection found one canvas, the expected route title and copy, and
  no Vite error overlay after repeated desktop and mobile interaction.
- Automated coverage verifies perimeter overflow, opposite-face isolation,
  attached-shell coupling, displacement limits, and responsive camera fit at
  the reduced amplitudes.
- No dependency or Supabase migration was added.

final result: passed

## Latest QA status: cross-page synesthesia background

The complete source/implementation evidence, normalized comparison details,
fidelity-surface review, responsive checks, interaction results, and
performance measurements are recorded in the `Chocolate synesthesia
background` and `Cross-page synesthesia propagation and two-second response`
sections above. Final desktop and mobile captures for butter, soap, and
chocolate contain no actionable P0/P1/P2 finding, and fresh browser sessions
report no application-owned console error.

final result: passed

## Clicker housing alignment and molded-corner refinement

### Evidence and normalization

- Source visual truth:
  `C:\Users\jleon\AppData\Local\Temp\codex-clipboard-5c1d3ba8-0c29-4db5-ac40-b0ad2e7110a8.png`
  at 629 x 851 pixels.
- Browser-rendered implementation:
  `qa/clicker-housing-smooth-final.png` at 627 x 851 pixels, captured from a
  627 x 851 CSS viewport at DPR 1 on `/clicker?qaDpr=1`.
- Equal-height full-view comparison:
  `qa/clicker-housing-before-after.png` at 1256 x 851 pixels. The supplied
  source occupies the left 629-pixel slot and the revised implementation the
  right 627-pixel slot without cropping, scaling, or stretching.
- State: idle clicker after the scene settled, with identical route controls.

The clicker fills enough of both captures to inspect the outer silhouette and
corner continuity directly, so a separate focused crop was not necessary.

### Findings and comparison history

- [Resolved P2] The source clicker's top and bottom edges descended toward the
  right because the product group retained a `-0.035` screen-plane rotation.
  Removing that rotation is equivalent to the requested slight
  counter-clockwise correction. The revised top and bottom edges now run
  parallel with the screen while the subtle depth presentation remains.
- [Resolved P2] The previous outer housing used a sparsely subdivided deformed
  cuboid. Its large corner arcs exposed straight facets and discontinuous edge
  highlights. The housing now uses Three.js's rounded-box surface with four
  curved segments per corner, continuous supplied normals, and the existing
  clear-coated plastic material. All four outer corners and side transitions
  read as one smooth molded part in the revised comparison.
- [Passed] Fonts and typography: no visible type or navigation typography was
  changed.
- [Passed] Spacing and layout rhythm: key positions, wells, rim thickness,
  centered framing, and navigation safe area are unchanged. Only the unwanted
  in-plane product tilt was removed.
- [Passed] Colors and visual tokens: the white plastic, yellow/pink/blue keys,
  studio lighting, background palette, and shadow treatment are unchanged.
- [Passed] Image quality and asset fidelity: the housing remains procedural
  WebGL geometry rather than a raster replacement. Smooth corner normals and a
  higher-resolution molded arc remove visible faceting without post-processing.
- [Passed] Copy and content: route title, hidden instructions, accessible
  navigation labels, and audio behavior are unchanged.

### Interaction, responsiveness, and performance

- A center-key pointer press still depressed and released the correct key and
  triggered the shared background burst. The page retained exact 627 x 851
  viewport dimensions with no overflow or Vite error overlay.
- The revised scene reports 18 draw calls and 11,175 rendered triangles, below
  the existing 12,000 clicker budget. Frame samples remained predominantly
  16.4-17.1 ms; the isolated automation capture pause was excluded.
- Fresh browser logs contained no application-owned error. The existing
  upstream `THREE.Clock` deprecation warning remains non-blocking.
- No dependency, persistence, backend, or Supabase migration was added.

final result: passed
