# Adding a move

Each move is one file exporting `createX(S, api, args)`. It returns an object the skater runs while the move is active:

| Field | Purpose |
|---|---|
| `id` | short name, e.g. `'spiral'` |
| `steer` | 0..1, how much the steering thumb still steers (default 1) |
| `holdFacing` | true if her facing should not follow her velocity |
| `start()` | optional, called once |
| `update(dt, steer)` | called each frame on the ice; return `false` when the move is over |
| `end()` | optional, called once when it ends for any reason; report results with `api.emit` |
| `yaw()` | optional extra body rotation in radians |
| `blade(out, yaw)` | optional; move the point where the line is drawn (`out.x`, `out.z`, `out.width`, `out.pen`) |
| `pose(T, kit)` | optional; set pose targets with `kit.set({...})`; may return a blend rate |

Start it with `skater.startMove(createX(...))`. Tuning numbers belong in `config.js`.
