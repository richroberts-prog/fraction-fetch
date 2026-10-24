# Fraction Fetch

A dog-themed match-3 game that teaches Year 5 (UK) fractions. Swap dogs to line up three
that are **worth the same**: ½, 2/4, 0.5 and 50% all match.

Play: https://richroberts-prog.github.io/fraction-fetch/ (installable, works offline).

## What's in v1

- **World 1, Bone Yard:** equal fractions, denominators up to 12, near-misses like ⅓ and 3/10.
- **World 2, Dog Park:** tenths, hundredths, decimals and percentages.
- 10 levels each, with 1 to 3 stars. Goals: collect dogs of a value, or clean a fraction of the mud.
- Special tiles: match 4 for zoomies (clears a row or column), match 5 for a tennis ball (clears
  every tile worth one value), an L or T shape for a treat bag (clears 3×3).
- A wrong swap that looks like a mix-up shows both values as bars. No penalty.
- The game remembers each child's mix-ups and deals more of those values.
- A 10-question fractions check before world 1 and after world 2; scores are on the profile.
- Tile colours and dog breeds are random and never hint at the value.
- No lives, no timers, no logins. Progress is saved on the device only; nothing is sent anywhere.

## Run it

```sh
npm install
npm run dev        # local server
npm test           # game logic (vitest)
npm run build && npm run e2e   # tablet, phone and laptop browser tests (Playwright)
```

## Where things are

- `src/core/`: game rules with no screen code (fractions, board, levels, profiles, check). Tested in `tests/`.
- `src/ui/`: PixiJS board, tile drawing, sounds (made in Web Audio, no files), styles.
- `src/main.ts`: screens.
- `scripts/gen-art.mjs`: makes the dog art via OpenRouter. Raw images are in `art-src/`, finished ones in `public/art/`.

Pushes to `main` deploy to GitHub Pages.
