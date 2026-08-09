# PoB Reality Check

PoB Reality Check is a Path of Exile 1 build-analysis tool that explains how realistic configured Path of Building conditions are. It imports supported `pobb.in` links, decodes the export, reads PoB's own exported calculation snapshot, resolves allocated passive nodes from the official PoB tree data, and reports build identity plus uncertainty-aware condition findings.

The current report includes:

- the main configured DPS skill as the build title;
- Full PoB DPS, configured skill DPS, average hit, life, EHP, block, suppression, and maximum-hit values when PoB exported them;
- a named passive-tree preview from the active PoB tree specification;
- linked gems, items, flasks, ascendancy sources, and supported configured conditions;
- separate source-backed, temporary, situational, mapping-only, and unverified findings.

Imported values are authoritative values from the PoB export, not invented estimates. Alternate peak, burst, sustained, initial, bossing, and mapping scenarios use the isolated Headless PoB worker when it is configured; otherwise the app deliberately shows them as unavailable.

## Development

Run `npm run dev` for the local app. Validation commands are `npm run typecheck`, `npm run lint`, `npm run unit`, `npm run e2e`, and `npm run build`.

The official Path of Building engine is kept separate from the TypeScript importer. The worker clones a pinned Path of Building Community revision and uses its headless wrapper for scenario recalculation; the application does not reimplement PoB's calculation engine. See `docs/engine-integration.md` for the Docker worker command.
