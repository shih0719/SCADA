# 燈控 SCADA — SvelteKit + SQLite + Modbus TCP (MVP)

Single-codebase SvelteKit app implementing the lighting-control SCADA MVP described
in `../SPEC.md`: Modbus TCP coil read/write, a SQLite-backed Space/Device/Circuit
model editable through the UI, a floorplan canvas with drag-to-position icons, and
backend-driven polling (no WebSocket).

## Project layout

```
src/
  hooks.server.ts            Starts the background Modbus polling loop when the
                              SvelteKit server process boots (see "Background
                              polling" below). Also triggers DB init.
  lib/
    types.ts                  Shared TS types used by client-side code.
    client/api.ts              fetch() wrappers for every backend endpoint.
    components/                Svelte 5 UI components (SpacePanel, DevicePanel,
                                CircuitPanel, FloorplanCanvas, CircuitIcon).
    server/                    Server-only modules (never bundled to the client):
      db.ts                     better-sqlite3 connection + schema (CREATE TABLE).
      types.ts                  DB row types.
      repo.ts                   All CRUD / query functions (Space, Device, Circuit).
      validation.ts             Input validation helpers (ip/port/etc).
      uploads.ts                Floorplan upload directory + constraints.
      runtime-state.ts          In-memory (non-persistent) circuit status cache:
                                 { circuit_id, value, status, last_updated_at }.
      modbus-poller.ts          The Modbus TCP client side: per-device polling
                                 loops (FC1), FC5 write, staleness threshold calc.
  routes/
    +page.svelte               The whole SCADA screen (space switch, floorplan,
                                drag/toggle, device & circuit management panels).
    api/
      spaces/...                Space CRUD + floorplan upload + status endpoint.
      devices/...               Device CRUD.
      circuits/...               Circuit CRUD + position PATCH + toggle POST.
      uploads/[...file]/        Serves uploaded floorplan images from disk.
scripts/
  modbus-simulator.ts          Standalone Modbus TCP server (FC1/FC5) for testing
                                without real hardware. See "Modbus simulator" below.
data/        (gitignored, created on first run) — scada.db (SQLite file)
uploads/     (gitignored, created on first run) — uploaded floorplan images
```

### Background polling — how it starts

SvelteKit is request-driven, but `src/hooks.server.ts` is evaluated **once, at
process start** (both for `vite dev` and for a built/`preview` server) — it is
not re-run per request. That file calls `startPolling()` from
`src/lib/server/modbus-poller.ts`, which:

1. Reads the current Device list from SQLite.
2. For every enabled Device, opens (or reuses) a persistent Modbus TCP
   connection and starts an independent `setInterval` loop at that device's
   own `poll_interval_ms`.
3. Each tick reads all coils for that device's circuits in **one** FC1 call
   (min..max address range) and updates the in-memory runtime-state cache.
4. On error/timeout it marks that device's circuits `error` and keeps retrying
   on the same interval — it never blocks or stops other devices' loops.

Any Device/Circuit CRUD operation calls `reloadPollers()` (also in
`modbus-poller.ts`), which rebuilds the per-device interval set so config
changes (new device, new circuit, changed poll interval, enable/disable) take
effect without restarting the server.

The frontend never triggers a Modbus read: `GET /api/spaces/:id/status` only
reads the in-memory cache that the background loop maintains.

## User documentation

Full end-user docs (Traditional Chinese) are static HTML in `static/docs/`,
served by the app at `/docs` and linked from every page header ("使用說明"):

- `/docs/install.html` — 安裝架設: requirements, simulator trial, production
  deploy (`.env`, `npm run build`, `npm start`), running as a Windows/Linux
  service, firewall, backup, upgrade, troubleshooting.
- `/docs/usage.html` — 配置使用: first-time setup, every panel, CSV import,
  operating, icon legend, scenes, schedules, status page, backup/restore.

## Production deploy (summary)

```sh
cp .env.example .env   # set TRUSTED_ORIGINS, PORT, BODY_SIZE_LIMIT...
npm run build          # adapter-node -> build/
npm start              # node --env-file-if-exists=.env build
```

`TRUSTED_ORIGINS` is baked in at build time (SvelteKit CSRF allowlist for
multipart uploads over plain HTTP) — rebuild after changing it. Requires
Node.js 22.17+. See `/docs/install.html` for details.

## Install & run (development)

```sh
cd stack-c-sveltekit
npm install
```

### 1. Start the Modbus TCP simulator (in one terminal)

No real PLC needed — `scripts/modbus-simulator.ts` exposes 32 coils (addresses
0–31) over Modbus TCP using `modbus-serial`'s `ServerTCP`, listening by default
on `127.0.0.1:15020`, unit/slave id `1`. Coils 0 and 2 start ON; everything else
starts OFF.

```sh
npm run simulator
```

You should see:

```
Modbus TCP simulator listening on 127.0.0.1:15020 (unit id 1)
Coils: 32 (addresses 0-31)
Initial ON coils: 0, 2
```

Writing a coil (via the app's toggle) logs `[sim] coil N -> ON/OFF` in this
terminal. Stopping this process (Ctrl+C) simulates the device going offline —
useful for testing acceptance criterion 6.

Override via env vars if needed: `SIM_HOST`, `SIM_PORT`, `SIM_UNIT_ID`, `SIM_COIL_COUNT`.

### 2. Start the SvelteKit dev server (in another terminal)

```sh
npm run dev
```

Open the printed URL (e.g. `http://localhost:5173`). The SQLite DB file is
created automatically at `data/scada.db` and uploaded floorplans are stored
under `uploads/floorplans/` — both are created on first run, nothing to set up.

### 3. Point a Device at the simulator and build a Space

In the UI sidebar:

1. **Spaces** → type a name → "Add Space" → selects it automatically.
2. Upload a PNG/JPG floorplan image for that Space ("Upload Floorplan").
3. **Devices** → expand the panel → fill in:
   - IP address: `127.0.0.1`
   - Port: `15020`
   - Slave ID: `1`
   - Poll ms / Timeout ms: leave defaults (1500 / 1000) or tune them.
   → "Add Device".
4. **Circuits** → pick the Device just created, give it a `coil_address`
   (e.g. `0`), a name, → "Add Circuit". It appears under "Not yet placed on
   the floorplan" until you place it.
5. Click "Place on map" next to the circuit, then click anywhere on the
   floorplan image to drop it there.
6. Click the circuit's bulb icon to toggle it (a quick click, not a drag).
   Drag it to reposition; release to save the new coordinates.

Everything (Spaces, Devices, Circuits, coordinates) is stored in SQLite and
survives a page refresh and a server restart. Nothing is hardcoded.

## API summary

All server-side logic lives under `src/routes/api/`:

- `GET/POST /api/spaces`, `GET/PATCH/DELETE /api/spaces/:id`
- `POST /api/spaces/:id/floorplan` — multipart upload (`file` field), returns
  the Space with `floorplan_image_path`/`width`/`height` filled in.
- `GET /api/spaces/:id/status` — current runtime state of every Circuit in
  that Space, read from memory only (no live Modbus call).
- `GET/POST /api/devices`, `GET/PATCH/DELETE /api/devices/:id`
- `GET /api/circuits?space_id=..`, `POST /api/circuits`
- `GET/PATCH/DELETE /api/circuits/:id`
- `PATCH /api/circuits/:id/position` — lightweight, called once per drag release.
- `POST /api/circuits/:id/toggle` — sends FC5, optimistic update + rollback on failure.
- Deleting a Space/Device that still has Circuits returns **409** with a
  `circuit_count`; retry with `?cascade=true` to delete the Circuits together
  with it. No orphan rows are ever left behind.

## Verifying the 8 acceptance criteria

With the simulator and dev server both running:

1. **Floorplan persists after refresh** — Create a Space, upload a floorplan,
   refresh the browser tab. The image still renders (served from
   `GET /api/uploads/...`, path stored in SQLite).
2. **Device creation/listing** — Add a Device with an IP/Port/Slave ID; it
   immediately appears in the Devices list.
3. **Circuit creation shows an icon** — Add a Circuit; it shows up under "Not
   yet placed" until positioned, then appears as a bulb icon on the floorplan.
4. **Drag persists position** — Drag a circuit icon to a new spot and release.
   Refresh the page: the icon is back at (approximately) the same spot — the
   position is saved via `PATCH /api/circuits/:id/position` on pointer-up, not
   on every frame.
5. **Toggle round-trip** — Pick a circuit you know is OFF (e.g. address 1).
   Click it: (a) the simulator terminal logs `coil 1 -> ON` immediately
   (FC5 write); (b) within the next poll cycle (~1–2s, UI polls every 1.5s)
   the icon turns on-colored once `GET /api/spaces/:id/status` reflects the
   new value — this is the real read-back, not just the optimistic UI update.
6. **Offline detection + recovery** — Stop the simulator (Ctrl+C in its
   terminal). Within one poll cycle, every Circuit on that Device switches to
   the hatched "offline/unknown" icon (never keeps showing the last known
   on/off value as if valid). Restart the simulator — within one more poll
   cycle the icons return to a normal on/off state automatically (the poller
   auto-reconnects every cycle without needing a server restart).
7. **Delete with associations is guarded** — Try to delete a Space or Device
   that still has Circuits: you get a confirmation prompt (surfaced from the
   API's `409 circuit has associated circuits` response); confirming retries
   the delete with `?cascade=true`, removing the Space/Device and its Circuits
   together, leaving nothing orphaned. Declining leaves everything untouched.
8. **Space switching is isolated** — Create a second Space with its own
   floorplan/circuits pointed at the same or another Device/coil addresses.
   Switch between Spaces in the sidebar: the floorplan, icon set, and polling
   target all switch immediately — the old Space's circuits stop being
   fetched/rendered (status polling restarts against the newly selected
   Space's `/api/spaces/:id/status` endpoint).

All 8 were manually exercised against the bundled simulator during
development (including killing/restarting the simulator process and deleting
a Space with 2 Circuits attached, both with and without `cascade=true`).

## Assumptions made (per SPEC.md's "假設" section)

- Coordinates are stored as original floorplan pixel coordinates; the
  frontend computes `displayScale = renderedWidth / floorplan_width` and
  converts both ways (`FloorplanCanvas.svelte`).
- A toggle on a Circuit whose current state is unknown (`error`/never polled)
  is rejected with `409` rather than guessing a direction — the UI only shows
  the bulb as clickable once a first successful read lands it in `ok`/`stale`.
- Floorplan uploads accept PNG/JPEG only, capped at 10MB, dimensions read via
  the `image-size` package (pure JS header parsing, no native deps).
- Stale threshold = `max(poll_interval_ms * 3, 5000ms)`, matching the "~3
  cycles or 5s" wording in SPEC.md; computed lazily when the status endpoint
  is read rather than via a separate timer.
- No HTTPS/CORS hardening, no optimistic locking — single internal
  control-station use case as specified.
- Deleting a Space/Device with Circuits blocks by default (409) and requires
  an explicit `?cascade=true` to cascade-delete, rather than silently
  cascading — this is surfaced in the UI as a `confirm()` prompt.

## Scope notes

Out-of-scope items from SPEC.md (auth, history/reports, alerts, WebSocket,
multi-layer/zoom floorplans, scenes/groups/schedules, Modbus RTU, analog
points, PWA, i18n, audit log, enforced test coverage) were deliberately not
implemented.
