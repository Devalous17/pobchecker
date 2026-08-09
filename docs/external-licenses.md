# External licenses

The application currently uses standard npm dependencies and does not embed Path of Building source code. The importer reads PoB's exported XML, and the passive-tree resolver may fetch the matching official `tree.lua` data at runtime from the Path of Building Community repository. The Phase 3 service clones Path of Building Community at pinned commit `32d4c87bf7888bf82c01d9e544f3bbb30f01f267` during container build. The upstream README directs users to its `LICENSE` file for third-party licenses. The service must preserve upstream notices and document the exact commit, tree-data usage, and wrapper changes when distributed. Re-review this file whenever the commit changes.

## poe.ninja

The report may use poe.ninja's documented `itemoverview` SkillGem endpoint to resolve optional gem artwork. The endpoint is treated as an optional, time-limited enrichment request and the application works without it. Character, profile, build, and Path of Building endpoints are not used because they are internal/unsupported surfaces; no poe.ninja character statistics are presented as automatically matched data. The poe.ninja site and API remain subject to their own terms and attribution expectations.

Reference: https://github.com/ayberkgezer/poe.ninja-API-Document and https://poe.ninja/docs.

## Path of Exile account and public-stash APIs

The official Path of Exile API documents character endpoints separately from the public-stash stream. Public stashes describe market listings and are not a source for a character's equipped items or linked skills, so the report uses the imported PoB XML for those values. An explicit OAuth-backed character reference may be added later; the application must not infer an account or character from a `pobb.in` link. See https://www.pathofexile.com/developer/docs/reference.

The `ayberkgezer/poe-api-manager` project is MIT-licensed and is an optional economy-data wrapper. It is not currently bundled as a runtime dependency; direct, time-limited poe.ninja requests keep the importer smaller and preserve graceful offline behavior. If it is incorporated later, retain its MIT notice and review its dependency licenses.
