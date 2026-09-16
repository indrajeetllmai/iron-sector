# IRON SECTOR

A single-player 5v5 browser FPS. You and four computer-controlled teammates face five opponents.

- Maps: Outpost, Dockyard, Sandstone
- Weapons: AK-47, M4A1, SR-25, MP5, SCAR-H, M870
- Desktop and touch controls, jump, sprint, slide, crouch, and toggle aiming

## Play locally

Serve this folder with any static web server, for example `python3 -m http.server 4173`, then open http://localhost:4173. ES modules require HTTP rather than opening the HTML file directly.

## Controls

Arrows or WASD: move. Mouse: look. Q or right click: toggle aim. Click or Space: fire. R: reload. E: jump. Shift: sprint. While moving forward and sprinting, C: slide; otherwise C: crouch. 1–6: switch weapon. Escape: pause.

Touch devices have a movement stick, swipe-to-look area and labelled action buttons. Controls & sensitivity can switch layouts manually.

## Deploy

This repository is ready-to-serve static HTML, CSS and JavaScript. There is no build or dependency-install step.

- Vercel: import the repository, framework Other, output directory `.`. The included vercel.json supplies these defaults.
- Netlify: import the repository, leave the build command empty, publish directory `.`. The included netlify.toml supplies this default.

The Sites edition's sign-in screen belongs to its host. These standalone deployments contain no sign-in requirement, backend, or online players.

## Third-party software

Three.js r170 is bundled as three.module.js under the MIT license; see THIRD_PARTY_LICENSES.txt. Google Fonts loads the Barlow families with local fallback fonts.
