# HOVER CORE

First-person cockpit mech combat for mobile and desktop browsers. You hover-skate across the ground, take off into free 360° flight, and fight in a training arena or in peer-to-peer PvP.

**Play:** https://ty-robb.github.io/hover-core/ (open it on your phone and turn it to landscape)

## Features
- **Cockpit view:** a 3D canopy frame and dashboard, with a live radar, armor/generator readout and weapons screen. The cockpit sways with acceleration.
- **Hover skating:** sprinting uses alternating left/right skate pushes with the view leaning into each stride. You carve turns with low friction, and skating tops out above 450 km/h.
- **Free flight:** hold RISE to take off. In the air the view has no pitch limit, so you can loop, roll and look anywhere, and thrust follows where you look. Auto-level is optional.
- **Look down to dive:** while boosting in the air you fly wherever you look. Look down to dive at the ground, and you land straight into a skate that keeps your speed.
- **Cockpit or third person:** tap 👁 (or press V) to switch.
- **Auto-aim:** shots near a target bend onto it, and the view gently tracks targets while you move fast. Adjust it with the Auto-aim slider in Settings.
- **Quick boost:** an instant dash in any direction for dodging.
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
| Missile | MSL | E / right click |
| Switch camera | 👁 | V |
| Pause | ❚❚ | Esc |

## Run locally
It's a static site with no build step. Serve the folder with any static server, for example:
```
npx serve .
```
or `python -m http.server`, then open `http://localhost:3000` (or `:8000`).

## Code
- `src/main.js`: game loop, movement and flight physics, weapons, AI, PvP sync, HUD, input
- `src/mech.js`: procedural low-poly mech builder and skating/flight animation
- `src/cockpit.js`: cockpit geometry and canvas dashboard screens
- `src/arena.js`: seeded arena layout (identical for every PvP client) and collisions
- `src/net.js`: PeerJS host-relay networking
- `src/fx.js`, `src/audio.js`: particles, tracers, speed lines, synthesized sound

PvP is client-authoritative (the shooter reports its hits), which is fine for friends but not cheat-proof.
