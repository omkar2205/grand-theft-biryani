# Grand Theft Biryani

A small browser-based, third-person GTA-lite prototype set in a compressed Hyderabad Old City neighbourhood centred on Charminar.

## Current playable build

- Procedurally generated low-poly Charminar
- One compact Old City neighbourhood
- Bazaar streets, residential blocks, garage and safe house
- Third-person walking and sprinting
- Mouse-controlled chase camera
- Enterable and drivable auto-rickshaw
- Moving traffic and pedestrians
- Mission 01: **The Pickup**
- Mission markers and minimap
- Health, money and wanted-level HUD foundation
- Pause, restart, save, continue and reset progress
- Browser-based save data using `localStorage`

## Controls

| Action | Control |
|---|---|
| Move / drive | WASD or arrow keys |
| Sprint | Shift |
| Interact / enter or exit vehicle | E |
| Rotate camera | Drag mouse |
| Adjust camera height | Mouse wheel |
| Pause | Escape |

## Run locally

```bash
npm install
npm run dev
```

## Deployment

The included GitHub Actions workflow installs the fixed Three.js and Vite dependencies, builds the static game, and deploys the generated site to GitHub Pages after changes reach `main`.

No backend, database, API key, Apps Script, Firebase or external runtime connector is required. Player progress is stored locally in the browser.

## Planned next milestones

1. Improve road and building collision handling
2. Add proper character and vehicle models
3. Add Mission 02: **Borrowed Wheels**
4. Add enemy and police behaviour
5. Add sound, dialogue and mission-complete sequences
6. Replace grey-box architecture with optimised `.glb` assets
