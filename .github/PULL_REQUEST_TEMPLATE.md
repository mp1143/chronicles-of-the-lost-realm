## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What is better for the player, or for whoever maintains this next? -->

## How you tested it

<!-- Be specific. "npm run verify passes" plus what you actually played. -->

## Checklist

- [ ] `npm run verify` passes locally
- [ ] Non-trivial logic has a test that fails without the change
- [ ] No `Math.random` in `src/` — randomness goes through `SeededRNG`
- [ ] `core/` and `sim/` still import nothing platform-specific
- [ ] If the save shape changed: `CURRENT_SCHEMA` bumped, migration added, fixture test added
- [ ] If balance changed: `npm run balance` still passes, and the PR says what moved
- [ ] If design changed: the relevant doc in `docs/` is updated in this PR
