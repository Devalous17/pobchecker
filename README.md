# PoB Reality Check

PoB Reality Check is a Path of Exile 1 build-analysis tool that explains how realistic configured Path of Building conditions are. Phase 1 imports supported `pobb.in` links, decodes the export, parses the XML, and reports build identity plus uncertainty-aware condition findings.

## Development

Run `npm run dev` for the local app. Validation commands are `npm run typecheck`, `npm run lint`, `npm run unit`, `npm run e2e`, and `npm run build`.

No DPS values are hardcoded. Headless Path of Building calculations begin in Phase 3 after the isolated service and license review are complete.
