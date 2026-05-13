# Installation

1. **Requirements:** Node.js 20+, npm, Windows 10/11 (or macOS/Linux for development).
2. **Clone** the repository and run `npm install`.
3. **Database:** `npx prisma db push` then `npx prisma db seed` for default users and permissions.
4. **Development:** `npm run dev` starts Electron with hot reload.
5. **Production build:** `npm run build` then `npm run dist` to produce installers under `release/` on Windows: **NSIS** (wizard + uninstaller + desktop shortcut), **portable** `.exe`, and **MSI** when the `msi` target is enabled in `package.json` / electron-builder config.
6. **Hardware mock (optional):** For labs or headless smoke tests, set environment variable `POS_HARDWARE_MOCK=1` or enable **وضع أجهزة وهمي** under **الإعدادات → الأجهزة** so printing and drawer pulses are skipped while sales still complete.

Default login is defined in the seed (typically cashier / admin roles with PIN from seed file).
