# VECTOR — Hover Core

Mobile browser mech combat prototype with original procedural low-poly mechs inspired by the supplied references. Training arena, cockpit overlay, momentum skating, boost, vertical flight, mouse/touch aiming and hitscan weapons.

## Play

Install Node.js 20 or newer, run `npm install`, then `npm start`. Open http://localhost:3000. On phones, use the host computer's LAN IP and port 3000 on the same Wi-Fi. Internet hosting needs HTTPS and WebSocket support. Three.js loads from a CDN, so internet access is required.

Desktop: WASD move, mouse aim, Shift boost, Space rise, Ctrl dive, click fire, R reset. Mobile: left joystick, drag the arena to aim, right action buttons.

## PvP

Two devices running against the same server join the same room code. Players synchronize at 20 Hz and can shoot each other; four hits reset armor and position. Training targets remain available. This is a prototype: hit claims and movement are client trusted, without matchmaking, accounts, anti-cheat or production authoritative simulation. Do not deploy as competitive ranked multiplayer.

## Status

Source implementation only; browser and multiplayer runtime verification are still required. This is a web game, not a packaged Android/iOS app. No third-party franchise assets are included.
