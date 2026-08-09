# Headless engine integration

The official `src/HeadlessWrapper.lua` bootstraps Path of Building without a GUI, supports standard Lua interpreters, and exposes `loadBuildFromXML` plus the loaded `build` object. PoB Reality Check wraps that API in `services/pob-engine/bridge.lua` and communicates over JSONL. The HTTP server starts a fresh Lua process per request so one build cannot contaminate another calculation state.

The Docker image clones Path of Building at a pinned commit rather than copying the source into this repository. It installs LuaJIT, keeps the engine outside the Next.js process, enforces a request size limit, uses an allowlist of scenario configuration fields, and never evaluates user-provided Lua.

The current repository does not have LuaJIT or Docker installed, so the service cannot yet be executed locally. The Next API returns a clear `503` until `POB_ENGINE_URL` points to a running service. No calculated values are shown when the service is unavailable.
