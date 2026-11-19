[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Jawwxz/teluk-cahaya/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Jawwxz/teluk-cahaya/reward.svg)](https://make.fun/bounty/gta6-01)

# Teluk Cahaya

An original open-world crime game for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01): explore a fictional sun-soaked coastal city on foot and by car, steal cars, dodge the Patroli, and run six missions as Raka the courier, caught between Geng Ombak and Keluarga Merpati.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **On foot:** WASD to walk, mouse to look, Shift to sprint, E to get in a car.
- **Driving:** W/S gas and brake, A/D steer, Space handbrake, E to get out.
- **More:** traffic, pedestrians, a wanted level with police response, missions, combat, shops, and a save — all offline, from static files under `game/`. Three.js is vendored under `game/vendor/`.

## Build

`game/` is the whole game (three.js vendored as `game/vendor/three.module.min.js`). `main.ts` copies `game/` and `screenshots/` to `/output` and writes the dossier the judge reads. Screenshots are real renders of the game in desktop Chrome.
