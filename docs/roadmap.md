# Roadmap and implementation status

## Complete or working locally

1. Foundation/importer: secure `pobb.in` URL handling, bounded raw retrieval, decoding, XML normalization, identity reporting, active skill/item import, and tests.
2. Static condition auditor: source evidence, reliability classes, configuration filtering, setup requirements, honesty/inflation-risk explanation, and evidence-backed recommendations.
3. Headless PoB service foundation: Dockerized LuaJIT wrapper, JSON boundary, request limits, error handling, and local web-to-worker integration. The worker must still be pinned and deployed as an operational service for production use.
4. Offensive scenario calculations: imported PoB snapshot, configured/conditional state, highest valid state, realistic burst, initial boss, sustained, and mapping outputs when the worker is online. Results carry status, confidence, conditions, assumptions, and a timeline.
5. Imported presentation: relevant offence/defence columns, PoB defensive/recovery fields, fixed passive-tree viewport with hoverable nodes, ascendancy-only source summary, skill-gem colour coding, and active equipment/flask cards with imported item text.

## Still to implement

- Defensive state depth: compare more defensive dependencies individually (guard skills, flasks, charges, Arcane Cloak, Fortification, conditional resistance, and block triggers) and expose per-condition attribution rather than only the current baseline/typical/peak states.
- Configuration calibration v1: present a proposed, evidence-backed PoB configuration profile that distinguishes imported settings, source-backed settings enabled by the analyzer, unsupported settings disabled for comparison, and settings that require user confirmation. The analyzer must never enable a condition merely because it increases DPS.
- Recovery modelling: separate normally available, active-combat, downtime, and mapping-only life/ES/mana recovery; leech caps and activation requirements need worker-backed evidence.
- Full timeline simulation: actual buff durations, cooldowns, charge generation, stages, flask charges, curses, movement/damage downtime, boss phases, and reactivation rather than the current explicit state assumptions.
- Vulnerability windows and offence/defence interaction: identify when simultaneous DPS and defensive layers expire and show the evidence for the resulting danger window.
- User-adjustable encounter assumptions for pinnacle boss, mapping, movement, flask policy, pre-placement, and encounter duration.
- Charts and ratings: timeline tracks, peak-vs-sustained charts, buffed-vs-unbuffed defence charts, and click-through category ratings tied to evidence.
- Broader mechanic registry coverage and more precise source detection for unsupported or ambiguous PoB conditions.
- Production operations: pinned PoB release/update policy, worker autoscaling/queueing, persistent caching, rate limiting, observability, and a separately hosted worker endpoint.
