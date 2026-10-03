# 1. 3D first-person game in the desktop browser

Date: 2026-10-03
Status: Accepted

## Context
Caitlin (game designer) wants an exploring game where you play as a dragon on a huge dragon-shaped island. Claude builds everything.

## Decision
- 3D, first-person perspective.
- Runs in a web browser on desktop/laptop computers (keyboard + mouse). Phones and tablets are out of scope.
- No deadline.

## Consequences
- Needs a WebGL 3D engine. The engine choice is still open.
- A world that is miles across must be streamed or split into chunks; it can't all be loaded at once.
