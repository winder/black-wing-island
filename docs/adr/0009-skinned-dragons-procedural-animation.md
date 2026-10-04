# 9. Skinned dragons with procedural animation

Date: 2026-10-04
Status: Accepted

## Decision
Dragons (the Player Dragon and Villagers) are one skinned mesh each, built in code, with a skeleton: spine, neck, jaw, a 10-bone tail, four legs, and wings with arm, forearm, hand and four finger bones. Animation is procedural, not keyframed: every frame `DragonAnimator` works out joint angles from what the dragon is doing.

- **Walking**: stride and gait come from speed (a walk, then a bounding run). Feet are planted with leg IK, so they don't slide.
- **Flying**: the wings beat with the elbow and wrist folding on the upstroke and the outer wing lagging behind the arm. Climbing or slow flight gets steady beats. Level cruising does a few beats, then glides. Diving half-folds the wings.
- **Follow-through**: the neck leads into turns and the tail lags behind them, each bone a little later than the one before.
- Swimming, Fire Breath (the jaw opens) and Claw Swipe (a front paw slashes) are layered on top.

## Why
Rigid pieces can't bend, so the old tail was a stack of cones and the wings were flat sheets. A skin bends smoothly. Procedural animation follows the player's real speed and turning, so it always matches what the dragon is doing. It also stays in code, like the rest of the art (ADR 0002).

## Consequences
- The look is still low-poly and flat-shaded with vertex colours. Only the bending is smooth.
- `tools/dragon.html` (served by `npm run dev`) shows the dragon from four sides doing one animation, or as a filmstrip, for tuning poses.
- Each animated dragon costs some CPU per frame. Villagers far from the player skip animating.
- Monsters are still rigid models. They can move to the same approach later.
