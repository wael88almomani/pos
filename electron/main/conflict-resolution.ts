/**
 * استراتيجية دمج Last-Write-Wins للوثائق JSON على مستوى الحقل الأعلى.
 * مناسبة كطبقة أولى لمزامنة LAN عندما يكون metadata.updatedAt موثوقًا.
 */
export function mergeLwwJson<T extends Record<string, unknown>>(local: T, remote: T, localTs: number, remoteTs: number): T {
  if (remoteTs > localTs) return { ...local, ...remote }
  if (remoteTs < localTs) return local
  return { ...remote, ...local }
}
