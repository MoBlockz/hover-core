# HOVER CORE

First-person cockpit mech combat for mobile and desktop browsers. You hover-skate across the ground, take off into free 360° flight, and fight in a training arena or in peer-to-peer PvP.

**Play:** https://moblockz.github.io/hover-core/ (open it on your phone and turn it to landscape)

## Features
- **Cockpit view:** a 3D canopy frame and dashboard, with a live radar, armor/generator readout and weapons screen. The cockpit sways with acceleration.
- **Hover skating:** sprinting uses alternating left/right skate pushes with the view leaning into each stride. You carve turns with low friction, and skating tops out above 450 km/h.
- **Free flight:** hold RISE to take off. In the air the view has no pitch limit, so you can loop, roll and look anywhere, and thrust follows where you look. Auto-level is optional.
- **Look down to dive:** while boosting in the air you fly wherever you look. Look down to dive at the ground, and you land straight into a skate that keeps your speed.
- **Third person ability:** tap 👁 (or press V) for 10 seconds of third-person view, then it recharges for 10 seconds.
- **Hangar customization:** size (standard suit or **giant armor**), frame, head, body (standard / sleek / heavy / reactor core), legs (biped / reverse-joint / quadruped / hover skirt), mobility (standard pack / twin boosters / wing binders / jump jets / vernier array), arms (twin / quad / gauntlets / long), normal or blade hands, main, side and close-range weapons, and main/accent/eye colors. Every part changes the model and the stats, and other players see your build in PvP.
- **Giant armor:** 4x size and armor, with mega cannons and an artillery battery. It is slow, burns fuel fast and has only a weak area swat for close range.
- **Detailed models:** panel-line outlines, vents, bolts, trim markings and antennas on every mech.
- **Close-range combat:** ⚔ (F / middle click) lunges at the nearest target in front of you and strikes. Quad arms add a second strike, and blade hands attack very fast.
- **Auto-aim:** shots near a target bend onto it, and the view gently tracks targets while you move fast. Adjust it with the Auto-aim slider in Settings.
- **Quick boost:** an instant dash in any direction for dodging.
- **Limited ammo:** each main weapon has a magazine plus a reserve. When both are empty, fly to one of the green supply crates around the arena to refill (crates respawn after 25s).
- **Long flight:** boosting and climbing drain the generator slowly, and cruising in the air recharges it.
- **Weapons:** a rifle with light aim assist, plus homing missiles that lock onto the target closest to your reticle.
- **Three low-poly frames:** STRIDER (olive, balanced), WRAITH (purple, fast) and BASTION (gunmetal, heavy).
- **Training arena:** static and sliding target mechs, flying drones, and a sparring AI that skates, flies, dodges and shoots back.
- **PvP:** host a room, share the 4-letter code, and up to 8 pilots can join. Players connect directly to each other over WebRTC (PeerJS), so no game server is needed.

## Controls
| Action | Touch | Keyboard / mouse |
|---|---|---|
| Move | Left thumb (floating stick) | WASD |
| Look | Drag right side (or drag FIRE) | Mouse |
| Skate-sprint / air boost | Push stick to edge, or BOOST toggle | Shift |
| Rise / take off | RISE | Space |
| Dive | DIVE | Ctrl / C |
| Quick boost | QB | Q |
| Fire rifle | FIRE | Left click |
| Side weapon | MSL | E / right click |
| Close-range lunge | ⚔ | F / middle click |
| Third person (10s) | 👁 | V |
| Pause | ❚❚ | Esc |

## Run locally
It's a static site with no build step. Serve the folder with any static server, for example:
```
npx serve .
```
or `python -m http.server`, then open `http://localhost:3000` (or `:8000`).

## Code
- `src/main.js`: game loop, movement and flight physics, weapons, AI, PvP sync, HUD, input
- `src/loadout.js`: parts, weapons and stats for customization
- `src/mech.js`: modular low-poly mech builder and skating/flight/melee animation
- `src/cockpit.js`: cockpit geometry and canvas dashboard screens
- `src/arena.js`: seeded arena layout (identical for every PvP client) and collisions
- `src/net.js`: PeerJS host-relay networking
- `src/fx.js`, `src/audio.js`: particles, tracers, speed lines, synthesized sound

PvP is client-authoritative (the shooter reports its hits), which is fine for friends but not cheat-proof.
