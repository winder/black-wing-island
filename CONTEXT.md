# Black Wing Island: Glossary

The game is called **Black Wing Island**.

Caitlin is the game designer. Terms below are the shared language for the game; use them consistently in code and docs.

| Term | Meaning |
|---|---|
| **Player Dragon** | The main character the player controls: an ordinary black dragon (no tribe yet), seen in first person. Can walk, run, and take off to fly anywhere with no tiredness limit. |
| **The Island** | The whole game world: one huge island shaped like a dragon, about 5 miles head to tail (about 5 minutes of fast flying). The same island every game (fixed seed). Its coastline comes from Caitlin's drawing. |
| **Biome** | A kind of land, painted by color on Caitlin's drawing (see Biome Map). |
| **Biome Map** | Caitlin's colored drawing (`assets/island-drawing.png`). Outline is pencil. Legend: **red** = volcano (head) · **blue** = forest (wings) · **yellow** = desert (body) · **brown** = mountain (spine) · **green** = meadow (limbs) · **dots** = beach (feet, tail, and offshore islands) · **black** = lakes and rivers, scattered around. Note: blue is forest, not water. Black dots = lakes, black lines = rivers (rivers run downhill to the sea or into a lake). White gaps inside the pencil outline are land, filled with the nearest biome. The yellow is colored loosely: **there is no desert north of the mountain spine**. A thin beach runs around the whole coast. |
| **Tail Islands** | The tail is a curving chain of separate islands with short flights between them (the pencil circles). Kraken territory. |
| **Toe Islands** | Small separate islands off each foot (the pencil dots), also reached by short flights. |
| **Sheep** | Harmless meadow animal. Not a monster. |
| **Kraken** | Several live in shallow water near beaches. Tentacles burst out to grab the dragon when it flies or swims low; Fire Breath makes them let go. |
| **Boss** | A giant version of a biome's monster (e.g. Yeti King, Great Lava Worm) at the end of each dungeon or monster castle. Beating it frees a trapped dragon or gives a lot of gold. |
| **Monster Castle** | An old castle taken over by monsters, with a Boss holding a dragon prisoner. Once cleared, it belongs to the player. |
| **Rescued Dragon** | Flies to the nearest village and lives there; may become a Quest Giver. |
| **Village Center** | Placed first to start a new village; becomes a Respawn point. |
| **House** | Village building; new dragons move in. |
| **Wall / Tower** | Village buildings that protect the village. |
| **Castle (built)** | The biggest player build; needs Gold. |
| **Power** | An upgrade (e.g. stronger Fire Breath, faster flying) given as a reward for big Quests. |
| **Lake** | Inland water. The dragon can dive and swim underwater in lakes. |
| **Ocean** | Surrounds the Island; it is the edge of the world. The dragon can't dive in it, and wind pushes the dragon back if it flies too far. |
| **Home Village** | A small village that exists at the start, in a meadow. The game begins here. |
| **Villager** | A dragon living in a village, in various colors. Quest Givers are villagers. |
| **Sound** | Sound effects from the start (wings, fire, monsters), made in code. Biome music comes later. |
| **Day/Night Cycle** | Sun sets and rises; a full day lasts about 20 minutes. |
| **Map** | Opens to show the whole Island. Covered in fog that clears where the player has explored. |
| **First-Person View** | Default view. Black wings show at screen edges when flying; claws show when attacking. |
| **Third-Person View** | Optional view from behind the dragon, toggled with a key. |
| **Village** | A settlement the player builds. Has quest givers. The player respawns at their last village. |
| **Castle** | Ambiguous on its own; say **Castle (built)** or **Monster Castle**. |
| **Quest** | A task from a Quest Giver: bring Materials, defeat monsters, rescue a dragon, or explore a place. Rewards are Materials and Gold; big quests sometimes give a Power. |
| **Quest Giver** | A character in a village who hands out quests. |
| **Animal** | A creature the player finds and raises. *Deferred, not in scope yet.* |
| **Monster** | A hostile creature that fights back and can hurt the Player Dragon. **All monsters are giant**, sized to fight dragons. One type per biome: **Sand Snake** (desert), **Giant Snail** (meadow: slow and chill, fitting the starting biome), **Wolf** (forest), **Kraken** (beach and islands), **Yeti** (mountain), **Lava Worm** (volcano). |
| **Fire Breath** | Ranged attack, aimed where the player looks. Hold left mouse (or E). Uses Fire. |
| **Fire (meter)** | Drains while breathing fire, refills when you stop. Run dry and you must wait for a little to refill. |
| **Health** | 100. Comes back on its own a few seconds after the last hit. At 0 you're **Knocked Out**. |
| **Knocked Out** | Health hit zero. Leads to a Respawn. |
| **Den** | A fixed spot where a monster (or a wolf pack, or a Kraken) lives. Cleared dens refill after 5 minutes. |
| **Claw Swipe** | Close-range attack. Right mouse (or F). |
| **Respawn** | When health runs out, the Player Dragon wakes at their last village. Nothing is lost. |
| **Materials** | Resources the player collects and spends to build. Starting set: **Wood** (claw down trees), **Stone** (smash rocks), **Gold** (found in caves and dungeons; needed for castles). |
| **Save Slot** | One of 3 saved games, picked on the title screen. Saves happen automatically every minute and after building. |
| **Inventory** | Where collected Materials go, automatically. |
| **Build Site** | A spot the player picks to place a building (e.g. a castle). |
| **Construction** | After a Build Site is chosen and Materials paid, the building is procedurally generated and visibly constructs itself over ~15 seconds. |
| **Tribe** | A kind of dragon with its own powers, inspired by *Wings of Fire*. *Deferred; the original tribes come later.* |
| **Point of Interest** | A hand-specified place (castle, dungeon, etc.) the generator must include. Added over time on top of procedural terrain. |
| **Cave** | An underground area to explore. |
| **Dungeon** | A dangerous enclosed area, likely with monsters. |

Tone reference: *Wings of Fire* (huge castles, dragons to save, villages, giant mountains, caves, dungeons).
