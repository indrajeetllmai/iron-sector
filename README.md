# IRON SECTOR

A free, public 5v5 browser FPS. Play solo with four computer-controlled teammates, or invite one friend: you + your friend + three computer-controlled teammates against five opponents.

- Maps: Outpost, Dockyard, Sandstone
- Weapons: AK-47, M4A1, SR-25, MP5, SCAR-H, M870
- Desktop and touch controls, jump, sprint, slide, crouch, and toggle aiming

## Invite one friend

Click **INVITE ONE FRIEND**, copy the link and send it to your friend. They open the link, join your squad, choose a weapon and press **I’M READY**. The host chooses the map and presses **DEPLOY TOGETHER**. Each squad is limited to two human players.

Both browsers must stay open. The host runs the shared match; pausing pauses both players. If the friend disconnects, a computer teammate takes over. If the host leaves, the friend returns to the loadout. Invites expire when the host closes or recreates the group.

PeerJS 1.5.5 uses the free PeerServer service for connection signaling and WebRTC for direct game data. No account, paid service, or persistent player database is used. Internet access is required for invites. This release uses STUN without a TURN relay, so some restricted or carrier networks cannot connect; the UI reports connection failures and solo play remains available.

## Play locally

Serve this folder with any static web server, for example `python3 -m http.server 4173`, then open http://localhost:4173. ES modules require HTTP rather than opening the HTML file directly.

## Controls

Arrows or WASD: move. Mouse: look. Q or right click: toggle aim. Click or Space: fire. R: reload. E: jump. Shift: sprint. While moving forward and sprinting, C: slide; otherwise C: crouch. 1–6: switch weapon. Escape: pause.

Touch devices have a movement stick, swipe-to-look area and labelled action buttons. Controls & sensitivity can switch layouts manually.

## Deploy

This repository is ready-to-serve static HTML, CSS and JavaScript. There is no build or dependency-install step.

- Vercel: import the repository, framework Other, output directory `.`. The included vercel.json supplies these defaults.
- Netlify: import the repository, leave the build command empty, publish directory `.`. The included netlify.toml supplies this default.

Sites, Vercel and Netlify deployments are public and free to play without sign-in. GitHub main automatically deploys to Vercel and Netlify.

## Third-party software

Three.js r170 is bundled as three.module.js under the MIT license; see THIRD_PARTY_LICENSES.txt. PeerJS is bundled as peerjs.min.js under the MIT license; see PEERJS_LICENSE.txt. Google Fonts loads the Barlow families with local fallback fonts.
