# Developer notes

- **Build:** `electron-vite` outputs `out/main`, `out/preload`, `out/renderer`. Main must stay free of Node APIs in the renderer; use IPC.
- **Tests:** `npm run test` runs Vitest (`lib/**/*.test.ts`, `tests/**`). `npm run test:e2e` runs Playwright against the dev server.
- **IPC contracts:** Add or adjust Zod schemas in `lib/ipc/schemas.ts`, validate in main with `parseIpc` from `electron/main/ipc-middleware.ts`, and return `{ ok: false, code: 'VALIDATION', message }` for renderer-safe errors.
- **Prisma:** After schema edits run `npx prisma db push` and update seed if permissions change.
- **Logging:** `electron/main/logger.ts` writes rotating-style daily logs under `userData/logs/` and `errors.log` for uncaught errors.
- **Type bridge:** `window.posApi` is typed as `any` in `vite-env.d.ts` to avoid duplicating every IPC response shape; narrow at call sites with `ok` / `in` checks.
