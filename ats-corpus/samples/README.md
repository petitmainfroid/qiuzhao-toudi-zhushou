# Validated samples

Do not add files manually from a browser download. Import them with `npm run corpus:import -- <path>` and run `npm run verify:corpus` after annotation changes.

Each sample is stored as `<page-type>-<16-character-structural-digest>.json` under its resolved ATS family. Capture timestamps are excluded from the digest so repeated collection of the same structure is idempotent.
