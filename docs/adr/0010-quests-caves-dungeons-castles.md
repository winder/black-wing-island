# 10. Quests, Caves, Dungeons and Monster Castles (Version 4)

Date: 2026-10-04
Status: Accepted. Decided with Caitlin; numbers are first guesses to playtest.

## Decided with Caitlin
1. **Monster Castles rescue, Dungeons pay.** One Monster Castle per biome (6). Its Boss guards a prisoner dragon; beating it frees the dragon and the castle becomes yours. A few Dungeons (3), whose Boss guards a big Gold Hoard. Many small Caves with gold to find and a few ordinary monsters, but no Boss.
2. **Caves are real tunnels** dug into hillsides, flown into with no fade. **Dungeons and castle insides** are behind a **Portal** (a dark doorway) that fades into a big, dark, procedurally generated **Interior**.
3. **Quests** come from Villagers with a **"!"** over their heads, and from a **Quest Board** in each village that shows a "!" the same way. Walk up and press **T**. One quest at a time.
4. **Rewards**: Materials and Gold; big quests give a **Power** (Hotter Fire, Swift Wings, Tough Scales, Deep Lungs) or an **Accessory** (a crown, a ruby amulet, different scale colours and sheens).

## Defaults Claude chose (change freely)
- Each Interior is generated from a seed, so the same castle has the same halls every game. Halls are tall enough to fly in. Torches light them; everywhere else is dark.
- A Boss is a giant version of its biome's monster (Snail King, Alpha Wolf, Great Sand Snake, Yeti King, Great Lava Worm, Kraken Queen): about twice the size, with much more health, and it hits harder.
- A rescued dragon flies to the nearest village, lives there and becomes a Quest Giver. A won Monster Castle is a village: a Respawn point that monsters keep away from.
- Beaten Bosses stay beaten (saved). Cave gold grows back like Gold Rocks.
- Quest types: bring Materials (hand them in to the giver), defeat monsters, rescue a dragon, explore a place. The other kinds finish by themselves when done.
- Rescues give the Powers and the crown and amulet; Dungeons give scale colours and sheens. **I** opens a screen to see your Powers and choose what to wear.
- You're never saved inside an Interior: saving there remembers the doorway outside.

## Consequences
- `Island.ground` is still the terrain. Caves and Interiors add their own floors, ceilings and walls on top, and the player asks those first when inside one.
- Monsters ask a `Floor` (just `heightAt`) rather than the whole Island, so a Boss can stand on an Interior's floor.
- Outside things (terrain, sky, villages) are hidden while in an Interior.
