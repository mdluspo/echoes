# Echoes - A Little Hamster Adventure

A side-view outdoor adventure in white paper and black sketch lines. A belted hamster explores one continuous route through a meadow, creek banks and a remembering grove, helped by copies of its recent movements. The screen focuses on the game; help and settings live in optional corner menus.

## Run

Node.js 18 or later: npm run dev. In restricted Windows PowerShell use npm.cmd run dev. The local preview runs at http://127.0.0.1:5175/. No third-party runtime dependencies are required.

## Play

- Left / Right or A / D: run.
- Shift + Left / Right: walk slowly.
- Space, W or Up: jump; hold for a higher leap.
- E or Enter: create an Echo of recent footsteps.
- Q: clear the Echo and begin a new recording in place.
- R: retry while keeping clones and collected seeds.
- Escape: pause. Touch movement, jump and Echo controls are available.

Creating an Echo leaves the hamster, camera, world clock and current recording in place. Up to two Echoes can replay together, each with its own clip and clock. A twelve-second rolling history is kept, but a clone replays only the latest second at the original movement speed, holds its final position for seven seconds, then disappears. When created on a plate, its clip begins with the most recent uninterrupted plate contact, so it holds the switch immediately without replaying the approach. The two ink slots above E show available capacity; filled slots are available, and a slot returns when its Echo expires. E is black with available capacity and white when both slots are occupied. Each clone's circle shows remaining time. Q or Vanish Echo frees both slots immediately and starts a fresh clip while retaining recent footsteps for immediate reuse; that fallback also uses the short replay. There is no recording delay after Vanish. Death clears the clones and both recordings, throws the body backward, flickers it, then removes it. The camera glides back to the checkpoint before respawning with a fresh recording. Collected seeds remain.

A striped plate scatters its matching 24-log pile. Ordinary scattered logs are harmless: they spin, fall, bounce and settle. On release they fade out one by one while new logs build locally from the bottom row up in about 0.72 seconds. A pile waits for a hamster already inside it before restoring collision. Sleeping debris, cached drawings and offscreen culling reduce frame cost.

Every section contains three separate Echo puzzles, nine across the connected route. Each switch and its barrier share an ink mark. The first puzzle uses an elevated switch and a creek crossing; the second is a harmless flat switch; the final high perch must be held by an Echo during a wide creek crossing. Use either free Echo slot or clear old clips with Q between puzzles. Barriers cannot be jumped over directly from their approaches.

The Meadow Path never fires aimed attacks, including after repeated presses, Echoes, retries or old saved learning. Attacks begin only in level two. Willow Creek introduces a narrow high earth ledge close to low cover. Jump from the grassy staging rise and create an Echo; if the logs prepare an attack, turn left and drop behind the ledge. Grounded direction changes brake immediately for a responsive retreat. The Remembering Grove's first and last puzzles can attack. Its opening trap requires jumping back across the collapsing retreat path onto solid landing ground; its final trap uses raised-bank cover. Both still roll a chance instead of always attacking. Flat middle switches remain harmless. Buried brambles have been removed.

Eligible piles aim all 24 logs at the player position captured on plate entry. Standard traps require real reachable cover. Level three's authored opening jump trap instead checks for a solid landing beyond its hole within the hamster's jump range. Escape eligibility is checked again before launch. Every eligible press, including the first encounter, rolls a 50% or 70% attack chance; holding the plate does not reroll. Flat switches never attack. Hostile logs lift for 0.22 seconds and launch at 0.46 seconds, independent of player movement, at around 1600 to 1800 pixels per second with slight variation. The lift and ordinary scattered logs are harmless. Swept collision includes both ends and checks earth cover before the player. Joining an Echo-held plate never rearms or rebuilds its pile.

Flags connect all three sections without a level-complete pause. Each section is now 4000 world pixels long, with four creek gaps and additional raised banks to traverse. Each flag starts a checkpoint and fresh recording. Completed sections remain until their flag passes entirely beyond the left edge of the view, then their scenery and collisions retire. The camera and hamster cannot backtrack into retired sections. The pause menu contains Resume, Restart, Sound and trail selection. Restart clears checkpoint progress and learned memory while retaining sound preferences. Idle and scenery animation stay on automatically.

The first death writes **Baviloya is Watching You** in bold ink at a fixed sky position above that spot. It disappears immediately once outside either edge of the camera view and never returns, including after respawn or reload. Its dismissed state is saved; later deaths never create another message. The distant backdrop draws at 28% opacity.

The game saves movement-route, jump, fall, retreat, Echo-use and aimed-log death counts. Later projectile speed receives a small bounded increase from previous log deaths. The third section develops the retreat strategy introduced by the second. This is authored progression with small rule-based memory, not a trained AI model. Seeds are optional; checkpoint progress, memory and settings use localStorage.

## Artwork

The latest [user-supplied hamster sheet](./src/assets/hamster-new-sheet.png) is preserved exactly: six columns and three rows of 256 x 256 pixels.

- [Idle](./src/assets/hamster-idle.png), [run](./src/assets/hamster-run.png) and [jump](./src/assets/hamster-jump.png) strips contain six equal frames each, in source row order.
- [Individual frames](./src/assets/hamster-frames/) preserve the source pixels and transparency.
- The [split script](./scripts/split-hamster.ps1) reproduces those assets with System.Drawing.
- The [meadow backdrop](./src/assets/meadow-sketch-v1.png) supplies sparse trees, distant hills and white sky.
- Foreground banks use the same terrain profile for drawing and collision. World-anchored vertices keep slopes steady during fractional camera movement. The short grass-bank drop is a longer gentle grade; genuinely steep descents use gravity instead of snapping downward. Terrain collision resolves feet above solid soil even after a large horizontal step. Actual creek gaps and the third-section hole remain physical drops. No exposed roots, floating supports or hidden bramble hitboxes.
- [Art direction](./src/assets/art-direction.json) records active assets, mechanics and exact background generation prompts.

Grounded sprites share a stable foot baseline. The renderer crops to the main drawing to exclude a few stray pixels from the previous row; the source artwork and split assets remain untouched. Locomotion advances with distance; jump poses follow vertical velocity and landing. Echo snapshots preserve gait and movement distance. Dotted Echo guides have been removed. Idle animation, gentle tree and grass movement, creek ripples, bobbing seeds and fluttering flags are enabled by default. The hamster is supplied by the user and has not been redrawn. The background was created with the built-in imagegen tool; older variants are retained but unused.

Text uses locally embedded Roman and Italic IM Fell English by Igino Marini, from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/imfellenglish), under the [SIL Open Font License](./src/assets/fonts/OFL.txt).

## Validation

npm run check checks JavaScript syntax. npm test covers movement, animation selection, independent Echo playback, physical scatter and sequential rebuilding, harmless debris versus aimed damage, the complete 24-log volley, terrain cover, the third-level collapse, first-death text, randomized retries and simulated completion of all three sections in one continuous run.
