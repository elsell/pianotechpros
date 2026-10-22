/** Failed local deletion must not make private presentation visible again. */
export async function dismissSession(port: {
  block(): void;
  clear(): Promise<void>;
  failed(): void;
  complete(): void;
}): Promise<boolean> {
  port.block();
  try { await port.clear(); }
  catch { port.failed(); return false; }
  port.complete();
  return true;
}
