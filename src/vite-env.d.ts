/// <reference types="vite/client" />

/**
 * Preload IPC bridge — typed as `any` so call sites can narrow with `ok` / `in`
 * without duplicating large response unions here.
 */
declare global {
  interface Window {
    posApi: any
  }
}

export {}
