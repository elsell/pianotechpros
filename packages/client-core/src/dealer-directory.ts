export interface DealerDirectoryPort<T extends { id: string }> {
  list(cursor?: string): Promise<{ items: T[]; nextCursor?: string }>;
  get(id: string): Promise<T>;
}
export type DealerDirectoryState<T, Failure> = Readonly<{
  accountId: string | null;
  items: readonly T[];
  nextCursor?: string;
  listLoading: boolean;
  listFailure: Failure | null;
  selectedId: string | null;
  selected: T | null;
  detailLoading: boolean;
  detailFailure: Failure | null;
}>;

/** Account-scoped reads only; platform models own navigation and translated copy. */
export function createDealerDirectory<T extends { id: string }, Failure>(classify: (error: unknown) => Failure) {
  type State = DealerDirectoryState<T, Failure>;
  const empty = (accountId: string | null): State => ({ accountId, items: [], nextCursor: undefined, listLoading: false, listFailure: null, selectedId: null, selected: null, detailLoading: false, detailFailure: null });
  let state = empty(null);
  let port: DealerDirectoryPort<T> | null = null;
  let scope = 0;
  let listGeneration = 0;
  let detailGeneration = 0;
  let loadingMore: Promise<void> | null = null;
  const listeners = new Set<(state: State) => void>();
  function publish(patch: Partial<State>) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener(state);
  }
  function reset(accountId: string | null, next: DealerDirectoryPort<T> | null) {
    scope++; listGeneration++; detailGeneration++; loadingMore = null; port = next;
    publish(empty(accountId));
  }
  async function readPage(append: boolean) {
    if (!port || !state.accountId || (append && !state.nextCursor)) return;
    const currentPort = port;
    const capturedScope = scope;
    const generation = ++listGeneration;
    const cursor = append ? state.nextCursor : undefined;
    const current = () => scope === capturedScope && generation === listGeneration;
    publish({ listLoading: true, listFailure: null });
    try {
      const page = await currentPort.list(cursor);
      if (!current()) return;
      const rows = new Map((append ? state.items : []).map((row) => [row.id, row]));
      for (const row of page.items) rows.set(row.id, row);
      publish({ items: Object.freeze([...rows.values()]), nextCursor: page.nextCursor, listLoading: false, listFailure: null });
    } catch (error) {
      if (current()) publish({ listLoading: false, listFailure: classify(error) });
    }
  }
  return Object.freeze({
    snapshot: (): State => state,
    subscribe(listener: (state: State) => void) {
      listeners.add(listener); listener(state);
      return () => { listeners.delete(listener); };
    },
    replaceSession(accountId: string, next: DealerDirectoryPort<T>) {
      if (!accountId.trim()) throw new Error('account identity is required');
      reset(accountId, next);
    },
    clear() { reset(null, null); },
    refresh() { loadingMore = null; return readPage(false); },
    loadMore(): Promise<void> {
      if (loadingMore) return loadingMore;
      if (state.listLoading || !state.nextCursor) return Promise.resolve();
      // Publish the in-flight promise before invoking listener or port code.
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      loadingMore = pending;
      void readPage(true).then(() => { if (loadingMore === pending) loadingMore = null; resolve(); }, (error) => { if (loadingMore === pending) loadingMore = null; reject(error); });
      return pending;
    },
    async select(id: string | null) {
      const capturedScope = scope;
      const generation = ++detailGeneration;
      const currentPort = port;
      const current = () => scope === capturedScope && generation === detailGeneration;
      publish({ selectedId: currentPort ? id : null, selected: null, detailFailure: null, detailLoading: Boolean(currentPort && id) });
      if (!currentPort || !id) return;
      try {
        const selected = await currentPort.get(id);
        if (current()) publish({ selected, detailLoading: false });
      } catch (error) {
        if (current()) publish({ detailFailure: classify(error), detailLoading: false });
      }
    },
  });
}
