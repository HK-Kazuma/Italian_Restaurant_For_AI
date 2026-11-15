# CLAUDE.md（下書き・リポジトリ直下に置く用）

Italian restaurant simulator (Three.js + TypeScript + Vitest). Work only on the
current branch unless told otherwise. Never touch `main`, never open a PR.

## File map (read only what the step needs)

- `src/game.ts` — core game state/logic. NEVER branch by dish name/id here; dish behavior comes from tables.
- `src/bake.ts` — BAKE_TABLE / SIDE_TABLE: dish definitions (vessel, stages, loads, finish).
- `src/scene.ts` — 3D scene and dish appearance (look tables live here, e.g. DoriaLook).
- `src/tutorial.ts` — tutorials: handwritten RECIPES first, otherwise table-driven generation (`tableRecipePlan` / `loadSource` / `tableSteps`).
- `src/testShared.ts` — shared test helpers; `TUTORIAL_PENDING_C10` lists dishes whose tutorials are not yet generatable.
- `src/menuList.ts` — menu categories/cards. `src/cookStock.ts` — stock/prep. `src/interaction.ts` — picking/tools. `src/input.ts` — keys.
- `src/config.ts` — tunable constants. Tentative （仮） values go ONLY in tables/config, never hardcoded in logic.
- `src/labels.ts` / `src/layout.ts` / `src/difficulty.ts` / `src/mission.ts` / `src/hud.ts` / `src/firebase.ts` (ranking) / `src/main.ts` (entry).

## Rules

- Design docs are the spec, but read ONLY the section named in the step prompt (it quotes the section). Do not read whole design docs.
- Grep before reading: locate the function/table first, then read that range only.
- Do not rewrite existing tests to make them pass. If a design change makes an expectation stale, stop, record it, and leave it for the human.
- No handwritten per-dish tutorial scripts (design §6); tutorials are generated from table data.
- Record spec-less judgments as one line in README's 「仕様にない判断」. Do not replace `DEV_CODE_HERE` in `firestore.rules`.
- Many files use CRLF line endings (the owner's editor). Preserve each file's existing line endings; never normalize them.
- The owner's hand edits are the base: ingredient-name display, tray placement, shelf layout, and UI changes in recent commits must be kept, not reverted.
- Run tests quietly; inspect only failures (e.g. `npm test 2>&1 | tail -30`). Finish with `npm test` + `npm run build` green, then commit with the message given in the step prompt.
