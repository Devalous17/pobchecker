# Architecture

Importing, decoding, XML normalization, condition detection, official PoB gem metadata, tree hydration, scenario orchestration, and report generation remain independent from React. The App Router route is a thin orchestration layer. `services/pob-engine` is an isolated LuaJIT worker; it must not execute user-supplied Lua.

The report puts combat scenarios first. Imported PoB values are exact snapshots, while worker results are authoritative recalculations and timeline-weighted values are marked estimated when duration assumptions are used. Poe.ninja comparison requires an explicit character URL and is kept separate from the PoB source of truth.
