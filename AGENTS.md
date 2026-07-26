# AGENTS.md

## Project identity

Squishy is a production, customer-facing Codefair project. Treat this
repository as durable application code, not a disposable prototype shell,
concept mockup, or generic landing page.

The product is a full-frame interactive ASMR squishy experience. Protect its
tactile feel, mobile support, iframe compatibility, and rendering performance.

## Core stack

Use this stack unless a task explicitly changes it:

- Vite
- React
- TypeScript
- React Three Fiber
- Three.js
- Drei
- Plain CSS
- Vitest
- Oxlint
- npm
- Vercel static deployment with native Git integration

Do not migrate to Next.js, introduce a backend, add a state-management library,
add a physics or animation library, add post-processing, or add heavy UI
frameworks unless the task explicitly requires it.

## Product and implementation rules

- Keep the interactive canvas as the product; avoid navigation, cards, and
  decorative UI chrome.
- Preserve pointer, touch, responsive-camera, and reduced-motion behavior.
- Keep geometry procedural and deformation deterministic.
- Maintain the shared inner-body/wax-shell deformation contract.
- Keep per-frame work allocation-free and enforce the documented polygon and
  draw-call budgets.
- Do not add fake cracking, fragment, audio, persistence, or success states.
- Add real tests for geometry, deformation, animation, and interaction logic.

## Supabase migrations

For every task, explicitly determine whether the work requires Supabase schema,
RLS, seed, function, trigger, or policy changes.

If Supabase becomes necessary:

- add committed migrations in `supabase/migrations`
- link the intended Supabase project
- run `npx supabase db push`
- verify the deployed schema and policies match the application
- report migration status in the task handoff

Do not leave required migrations unapplied or as dashboard-only instructions.
The current prototype has no persistence and does not require Supabase.

## Required checks

Before finishing every task, run:

```bash
npm run lint
npm run check
npm test
npm run build
```

Also perform task-specific browser QA when rendering or interaction changes.

## Pull request handoff

After repository bootstrap, every task must end with its changes committed,
pushed, and opened as a pull request. Do not consider documentation-only or
small patch tasks exempt. Include validation results, manual QA, performance
impact, and Supabase migration status in the PR description.
