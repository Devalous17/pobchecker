# Architecture

Phase 1 keeps importing, decoding, XML normalization, condition detection, and report generation independent from React. The App Router route is a thin orchestration layer. `services/pob-engine` is intentionally reserved for an isolated LuaJIT worker; it must not execute user-supplied Lua.

The report currently describes imported facts and uncertainty. Alternate combat numbers only become available after a pinned Headless PoB integration exists.
