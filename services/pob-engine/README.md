# PoB engine service

This service is the Phase 3 isolation boundary. It runs the official Path of Building Community headless wrapper in a separate container and accepts only a typed JSON request over HTTP. The application never executes user-supplied Lua and never sends arbitrary commands to PoB.

The service is pinned to commit `32d4c87bf7888bf82c01d9e544f3bbb30f01f267` from the official repository at the time this foundation was created. Update the pin deliberately, run the engine fixture suite, and review license changes before upgrading.

The current wrapper contract is based on the official `HeadlessWrapper.lua` API: it loads the PoB runtime, calls `loadBuildFromXML`, applies a small allowlisted configuration map, runs `BuildOutput`, and serializes selected numeric fields. The open JSON-RPC pull request was not used as a dependency because it is not the stable official wrapper contract.

The image also adds PoB's pinned `runtime/lua` directory to `LUA_PATH` and installs the MIT-licensed `luautf8` LuaRocks module for Linux. PoB's official Windows runtime contains `lua-utf8.dll`, which cannot be loaded by Linux LuaJIT. `/health` runs a Lua dependency probe, so `engineReady: true` now means the XML, JSON, and UTF-8 runtime modules can load. The HTTP boundary also preserves PoB startup diagnostics instead of masking them as invalid JSON.
