# Headless engine integration

The official `src/HeadlessWrapper.lua` bootstraps Path of Building without a GUI, supports standard Lua interpreters, and exposes `loadBuildFromXML` plus the loaded `build` object. PoB Reality Check wraps that API in `services/pob-engine/bridge.lua` and communicates over JSONL. The HTTP server starts a fresh Lua process per request so one build cannot contaminate another calculation state.

The Docker image clones Path of Building at a pinned commit rather than copying the source into this repository. It installs LuaJIT, keeps the engine outside the Next.js process, enforces a request size limit, uses an allowlist of scenario configuration fields, and never evaluates user-provided Lua.

Run the local worker with Docker from this directory:

```text
docker compose -f services/pob-engine/docker-compose.yml up --build
# PowerShell:
$env:POB_ENGINE_URL="http://127.0.0.1:8080"; npm.cmd run dev
```

The Next API returns a clear `503` until `POB_ENGINE_URL` points to a running service. No calculated values are shown when the service is unavailable. Sustained DPS is timeline-weighted from engine-returned states and is marked estimated whenever the timeline uses explicit duration assumptions.

The hosted web app and the calculation worker are separate runtime components. Deploying the Next/Cloudflare site does not start Docker or LuaJIT, so the hosted environment must be given the HTTPS URL of a separately hosted worker through its `POB_ENGINE_URL` runtime variable before alternate scenarios can run. The scenario panel checks `/api/engine/status` and explains this state instead of presenting fabricated numbers.

The wrapper and data files remain upstream-owned source. The service must preserve the upstream MIT license and third-party notices, and the commit pin must be reviewed whenever PoB is upgraded.
