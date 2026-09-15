# @adelaide-sphere/contracts

The API's OpenAPI 3 document (`openapi/api.json`) and the TypeScript types generated from it (`src/api.d.ts`). Frontends import types only; no persistence models or runtime code (SRS ARC 001, API 001).

- Regenerate after API changes: `pnpm contracts:generate` (builds the API, writes the document, regenerates types).
- `pnpm --filter @adelaide-sphere/contracts check` verifies the committed types match the document (run in `pnpm check`).
- TypeScript here is pinned to 5.9.3 because `openapi-typescript` 7 declares a `^5` peer; consumers use their own compiler.
