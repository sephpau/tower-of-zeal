# Integration notes — Gauntlet Tower ↔ MoTZ Design System

Living doc tracking how this repo applies the MoTZ design system.

## Where the tokens live

- **Source-of-truth reference**: `design-system/colors_and_type.css` — copied
  verbatim from the MoTZ design system zip (with un-prefixed names like
  `--motz-red`, `--surface`, `--grad-button`).
- **In-app tokens**: `src/styles.css` `:root` block. Every MoTZ token is
  re-declared there with a `--motz-*` prefix to avoid colliding with the
  legacy Gauntlet Tower tokens (e.g. legacy `--text-dim` is cool-purple,
  MoTZ `--text-dim` is warm-stone). Until a component is migrated, it
  keeps referencing the legacy tokens.

## Migration convention

When migrating component X from legacy to MoTZ:

1. Read the existing CSS rule for X in `src/styles.css`.
2. Swap legacy var references for `--motz-*` equivalents (color, spacing,
   radius, shadow, font).
3. If X used a hex/rgb literal that should now reference a token, swap it.
4. Touch CSS only — no markup churn unless the design requires it.
5. Bump `REPLAY_VERSION` only if combat math is affected (it usually isn't
   for pure styling).

## What's been migrated

Nothing yet. Tokens are wired but no component uses them — by design. The
user directs migrations one component at a time.

## Substitutions to flag

- **YOURMATE** (display font, brand-canonical) → **Fredoka** (Google Fonts
  substitute). Drop `/fonts/Yourmate.woff2` into `public/fonts/` and add
  an `@font-face` declaration to swap in the canonical face.
- **Roc Grotesk** (body font) → **Inter** (Google Fonts substitute). Same
  substitution path as above.

## How to add new MoTZ tokens

1. Add the token to `design-system/colors_and_type.css` with its
   un-prefixed name (matches the brand canonical source).
2. Re-declare in `src/styles.css` `:root` with a `--motz-` prefix.
3. Commit both files in the same change so the two stay in sync.

## Preview / reference

- `design-system/preview/` — HTML cards rendering each token group
  (colors, gradients, type, components). Open any of them in a browser
  to see how a token should look in isolation.
- `design-system/ui_kits/website/` — High-fidelity recreation of the
  markofthezeal.com hub. Use as a reference for how the system feels
  when assembled into a full page.
- `design-system/README.md` — Brand context, voice, hover/animation
  rules, card anatomy, iconography conventions.

## Out of scope (intentionally excluded from the repo)

- `assets/` folder from the zip (~13MB of brand imagery, mascot renders,
  vault key art, etc.). Lives in the original zip — pull from there if a
  specific image is needed. Avoiding repo bloat for assets the game
  doesn't directly use.
