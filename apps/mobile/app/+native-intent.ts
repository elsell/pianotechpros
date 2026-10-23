/** AuthSession consumes the original link; navigation must never display it. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return /^(?:pianotechpros:\/\/\/?|\/)callback(?:[?#]|$)/i.test(path) ? '/' : path;
}
