# PoB Reality Check

PoB Reality Check is a free Path of Exile 1 website that reviews a build from Path of Building and gives it an honest rating.

It shows:

- Overall, offence, defence, clear, and bossing grades
- Imported DPS, life, energy shield, resistances, recovery, and maximum-hit values
- Defence targets and practical improvement gaps
- Reliable, conditional, temporary, and unverified build conditions
- General offence and defence advice for normal Tier 16 mapping
- Imported skills, gems, equipment, flasks, and build information

## Recommended input

Use a correctly configured personal PoB export shared through `pobb.in`. This is the most accurate source because it preserves the skills, equipment, passives, conditions, and DPS settings you actually use.

PoE Ninja import codes are supported as a fallback, but they may be incomplete or configured differently from the original build.

## What the rating means

The rating is an evidence-based build-quality score, not a promise that a character will survive every encounter. It uses the values exported by PoB and explains why the build received its grade.

The website does not run alternate combat scenarios or pretend to calculate values that were not included in the imported PoB snapshot.

## Run locally

Install dependencies, then start the development server:

```powershell
npm install
npm run dev
```

Open the local address shown in the terminal.

## Validate the project

```powershell
npm run typecheck
npm run build
```

## Deploy

The website can be deployed as a free Render web service from the GitHub repository:

- Repository: `Devalous17/pobchecker`
- Branch: `main`
- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm run start`

Made by Devalous.
