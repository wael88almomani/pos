/** Session state shared across IPC handlers (main process only). */
export const auth = {
  userId: null as string | null,
  sessionId: null as string | null
}
