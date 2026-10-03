# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # typecheck + production build
npm run island     # rebuild public/island/* and assets/island-preview.png from the drawing
npx tsx tools/shot.ts out.png "x=..&z=..&y=..&yaw=..&pitch=..&mode=fly&time=0.5&third&map" [waitMs] [frames]
                   # headless screenshot (needs `npm run dev` running); "title" for the title screen
```

`?debug` in the URL skips the title screen and exposes `window.game`. Add `&spawn=wolf&dist=60` to put a monster (snail, wolf, sandSnake, yeti, lavaWorm, kraken) in front of the dragon. `PORT=5174` points `tools/shot.ts` at another dev server.

## Architecture Overview

*Black Wing Island*: a 3D first-person browser game (Three.js + TypeScript + Vite). Caitlin is the game designer.

- `CONTEXT.md`: glossary and domain language. Use these terms in code.
- `docs/adr/`: architecture decisions.
- `assets/island-drawing.png`: Caitlin's drawing, the source of the island's coastline and biomes.

## Conventions & Patterns

- `src/world/island.ts` `Island.ground(x, z)` is the single source of truth for terrain height, water, biome and coast. Everything that stands on the ground asks it.
- World units are metres, y up, north = -z. One map pixel = 12.5 m.
- The world is deterministic (fixed seed in `src/world/noise.ts`; scatter uses `hash2`). Don't use `Math.random()` for anything placed in the world.
- Low-poly look: `flatShading: true`, vertex colours, models built from three.js primitives in code.
