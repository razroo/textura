## Textura

DOM-free layout engine combining Yoga (flexbox) with Pretext (text measurement).

### Commands

- `bun install` — install dependencies
- `bun run check` — type-check with tsc
- `bun test` — run tests
- `bun run build` — emit ESM to `dist/`

### Important files

- `src/index.ts` — public API entry point (re-exports from engine and types)
- `src/engine.ts` — core engine: Yoga tree building, Pretext MeasureFunction wiring, layout computation
- `src/types.ts` — declarative input types (BoxNode, TextNode, FlexProps) and computed output types
- `src/index.test.ts` — tests (box layout tests run in Bun; text tests require browser canvas)
- `tsconfig.build.json` — publish-time emit config for `dist/`
- `.github/workflows/release.yml` — GitHub Actions workflow: publishes to npm on GitHub Release

### Releasing to npm

A GitHub Actions workflow handles npm publishing for both packages. To release:

1. Create a GitHub release with a `v`-prefixed tag (e.g. `gh release create v0.2.0 --title "v0.2.0" --notes "..."`)
2. The workflow automatically:
   - Builds and publishes `textura` to npm
   - Then builds and publishes `@razroo/textura-mcp` to npm (with matching version and dependency)
3. Requires `NPM_TOKEN` secret configured in the repo

Do **not** publish manually via `npm publish` — use the release workflow.

### Implementation notes

- `init()` loads Yoga WASM via `yoga-layout/load` (async). Must be called before `computeLayout`.
- `computeLayout()` builds a Yoga node tree, sets `MeasureFunction` on text leaves using Pretext's `prepare()` + `layout()`, runs `calculateLayout()`, reads back geometry, and frees the tree.
- Text nodes are Yoga leaf nodes (no children). The MeasureFunction calls Pretext to get height given Yoga's width constraint.
- Yoga config uses `setUseWebDefaults(true)` to match CSS browser flex defaults.
- Yoga nodes must be manually freed (`freeRecursive`). This happens inside `computeLayout` after readback.
- Text measurement requires a canvas context (browser `document.createElement('canvas')` or `OffscreenCanvas`). Tests that need text measurement are skipped in Bun.
- Keep `.js` specifiers in imports for plain tsc emit compatibility.
