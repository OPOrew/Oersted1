Regenerate Kotlin from the web source (run from tools/, after `npm install`):

    npm run export-data   # static JSON for assets/data
    mkdir -p ../build && npm run dump-init   # initialSim as JSON
    npm run gen-sim       # sim/SimTypes.kt (SimState, Faults, Derived, lights, initialSimState())

Re-run gen-sim whenever reference/web/src/lib/sim/types.ts or lights.ts or initial.ts change,
then re-run the unit tests. Never hand-edit SimTypes.kt.
