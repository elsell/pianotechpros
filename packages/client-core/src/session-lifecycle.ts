type Session = { token: string; expiresAt: string };
export type SessionLease = Readonly<{
  current(): boolean;
  persist(session: Session | null): Promise<void>;
}>;

/** Serializes secure storage while invalidating late network completions. */
export function createSessionLifecycle(persist: (session: Session | null) => Promise<void>) {
  let generation = 0;
  let tail = Promise.resolve();
  function enqueue(operation: () => Promise<void>) {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  }
  return {
    capture(): SessionLease {
      const expected = generation;
      const current = () => generation === expected;
      return { current, persist: (session) => enqueue(async () => {
        if (current()) await persist(session);
      }) };
    },
    clear() {
      generation++;
      return enqueue(() => persist(null));
    },
    invalidate() { generation++; },
  };
}
