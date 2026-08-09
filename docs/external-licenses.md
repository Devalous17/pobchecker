# External licenses

The application currently uses standard npm dependencies and does not embed Path of Building source code. The Phase 3 service clones Path of Building Community at pinned commit `32d4c87bf7888bf82c01d9e544f3bbb30f01f267` during container build. The upstream README directs users to its `LICENSE` file for third-party licenses. The service must preserve upstream notices and document the exact commit and wrapper changes when distributed. Re-review this file whenever the commit changes.

## poe.ninja

The report may use poe.ninja's documented `itemoverview` SkillGem endpoint to resolve optional gem artwork. The endpoint is treated as an optional, time-limited enrichment request and the application works without it. Character, profile, build, and Path of Building endpoints are not used because they are internal/unsupported surfaces; no poe.ninja character statistics are presented as automatically matched data. The poe.ninja site and API remain subject to their own terms and attribution expectations.

Reference: https://github.com/ayberkgezer/poe.ninja-API-Document and https://poe.ninja/docs.
