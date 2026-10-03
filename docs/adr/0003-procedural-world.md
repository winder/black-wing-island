# 3. Procedurally generated world, constraints added over time

Date: 2026-10-03
Status: Accepted

## Decision
Most of the Island is procedurally generated. Over time, constraints and Points of Interest (castles, dungeons, and so on) are layered on and must be included by the generator.

## Consequences
- The generator must accept constraints/POIs as input rather than being purely noise-driven.
- Terrain is generated in chunks and streamed around the player.
