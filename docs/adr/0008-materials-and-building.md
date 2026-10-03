# 8. Materials and building (Version 3)

Date: 2026-10-03
Status: Accepted. Caitlin approved each of these.

## Decisions
1. **Gold** comes from defeated giant monsters and from rare gold rocks in the mountains. (Caves and dungeons come in Version 4.)
2. Trees and rocks **grow back** after about 10 minutes.
3. **Costs**: Village Center 20 wood + 10 stone · House 10 wood · Wall 15 stone · Tower 10 wood + 20 stone · Castle 50 wood + 80 stone + 20 gold.
4. **Build mode**: press B for a build menu, pick a building, and a see-through ghost follows where you look. Click to place it.
5. **Where**: a Village Center or a Castle can go anywhere flat enough. Houses, Walls and Towers must be inside a village (near a Village Center; the Home Village counts).
6. **What buildings do**: a Village Center starts a village, which becomes a respawn point, and monsters keep away from it. Each House brings a new villager dragon. Towers shoot fire bolts at nearby monsters. Walls are for looks and protection.
7. **Saving**: buildings, materials and your last village are saved. Cut-down trees are not, because they grow back.

## Consequences
- Scatter (trees, rocks) is still generated from the fixed seed. A harvest registry hides harvested items until they regrow.
- Buildings sit on generated plinths instead of flattening the terrain, so terrain generation stays a pure function.
