# Echoes — A Little Hamster Adventure

A side-view outdoor adventure in white paper and black sketch lines. A little belted hamster explores one continuous route through a meadow, creek banks and a remembering grove, with help from timed copies of its past movements. The screen focuses on the game; help and settings live in optional corner menus.

## Run

Node.js 18 or later: `npm run dev`. In restricted Windows PowerShell use `npm.cmd run dev`. The current local preview is `http://127.0.0.1:5175/`. No third-party runtime dependencies are required.

## Play

- Left / Right or A / D: run.
- Shift + Left / Right: walk slowly.
- Space, W or Up: jump; hold for a higher leap.
- E or Enter: create a clone of the last eight seconds.
- R: retry while keeping clones and collected seeds.
- Escape: pause. Touch arrows, jump and Echo controls are available.

A striped plate flings its matching log pile outward with random launch velocities and spin. Some logs fly offscreen; others fall, bounce and settle on the ground. They stay scattered while a hamster or clone holds the plate. Release fades the scattered pieces out one by one while new logs pop into place from the bottom row up, LEGO style, in about 0.72 seconds. Debris never flies back across the screen. A pile waits for a hamster already inside it to finish crossing before restoring collision.

Leave a clone on the plate to cross the obstacle. Creating an Echo leaves the hamster, camera, current recording and world clock in place. Each clone starts at the first frame of its recorded clip and uses its own birth tick. A clone replays at most eight seconds, holds its final position for three seconds, then disappears. Fatal hits and falls briefly pause the hamster, then respawn at the section checkpoint while preserving clones and collected seeds and restarting their playback. A full section reset also clears clones and seeds.

The Meadow Path flows directly into Willow Creek and The Remembering Grove. Walk past each flag without a level-complete pause. Each flag starts a new checkpoint and a fresh Echo recording. Completed sections remain until their flag passes entirely beyond the left edge of the view, then their scenery and collisions are removed. The camera and hamster cannot backtrack into retired sections.

The first death writes **Baviloya is Watching You** in bold ink at a fixed point in the sky above that spot. The message stays there after movement and respawn and is saved with the adventure. Later deaths never create another message. It retires with its section when that section leaves the view. The distant backdrop draws at 28% opacity to keep the foreground clear.

The first entry onto a plate only scatters harmless debris. The entire first section is a safe tutorial with no aimed log attacks, including repeated presses, Echoes, retries and old saved learning. It observes those actions for later sections. In sections two and three, familiar repeat entries by the hamster or an Echo independently have 50% and 70% attack chances. Holding a plate never rerolls the attack. Later sections add more shots, shorter warnings and a second volley; raised banks block incoming shots. Only explicitly hostile projectiles cause damage, never ordinary scattered logs. Hit detection sweeps the whole rotating log, including both ends, against the visible hamster and checks terrain cover first. A hit shows the hamster fallen on its side before checkpoint respawn.

The game remembers high/low movement through a route sample and saves jump, fall, Echo-use and aimed-log death counts at checkpoints. The grove places its brambles on the previously used route height, and later volleys get a small bounded speed increase based on earlier log deaths. This is a small rule-based memory system, not a trained AI model. Seeds are optional collectibles. Checkpoint progress, movement memory and settings stay in localStorage.

## Artwork

The user's [original hamster sheet](./src/assets/hamster-belted-sheet.png) is preserved. It contains six columns and three rows of exactly 256x256 pixels.

- [Idle strip](./src/assets/hamster-idle.png), [walk strip](./src/assets/hamster-walk.png), and [jump strip](./src/assets/hamster-jump.png): six equal frames each.
- [Individual frames](./src/assets/hamster-frames/): eighteen lossless transparent 256x256 PNGs.
- [Split script](./scripts/split-hamster.ps1): reproduces the strips and individual frames using System.Drawing.
- [Meadow backdrop](./src/assets/meadow-sketch-v1.png): sparse trees, distant hills, grass and open white sky.
- Foreground terrain: continuous raised grass banks drawn in Canvas, with sparse grass and dirt flecks. Visuals and movement share the same ground profile; no exposed roots or floating platforms.
- [Art direction and generation prompts](./src/assets/art-direction.json): active asset specifications and exact outdoor prompts.

The environment uses white fills and black lines, without colored surfaces, gray washes or atmospheric gradients. The meadow raster backdrop was made using the built-in imagegen tool. The hamster was supplied by the user and was not redrawn. Older environment variants are retained but unused.

Grounded sprites share a stable foot baseline. Walking and running use the supplied locomotion sequence at movement-driven speeds. Jump poses follow vertical velocity and landing. Clone snapshots preserve movement distance and gait.

[Log animation](./src/log-motion.js) runs in the game simulation, so launching, bouncing, rebuilding, pause and obstacle collision stay synchronized. Each press generates a new scatter. Ground contacts let debris settle on its side and remain until the plate is released. Resting pieces sleep, offscreen pieces are culled from drawing, and log drawings are cached. Re-pressing during construction flings both built pieces and remaining debris from their current positions. Flags mark section boundaries. Background trees scroll slowly behind the foreground.

Text uses locally embedded Roman and Italic IM Fell English by Igino Marini, from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/imfellenglish), under the [SIL Open Font License](./src/assets/fonts/OFL.txt).

## Validation

`npm run check` checks JavaScript syntax. `npm test` covers movement, jumps, animation selection, open sky, walkable terrain, ballistic log scatter and sequential rebuilding, independent clone playback, harmless scatter versus aimed damage, terrain cover, first-death world text, randomized attack chances and actual simulated completion of all three sections, including a continuous full run and retired-section backtracking locks.
