import { createDealerCreation } from './dealer-creation';
export interface DealerEditorState<Profile> {
  busy: boolean; uncertain: boolean; conflict: boolean;
  latest: Profile | null; saved: Profile | null; failure: unknown;
}
/** Explicit conflict review and idempotent creation, independent of presentation. */
export function createDealerEditor<Input extends object, Profile extends { id: string; revision: number }>(port: {
  initial: Profile | null;
  key(): string;
  create(input: Input, key: string): Promise<Profile>;
  update(id: string, input: Input, revision: number): Promise<Profile>;
  get(id: string): Promise<Profile>;
  rejectedBeforeCreation(error: unknown): boolean;
  conflict(error: unknown): boolean;
}) {
  const empty = (): DealerEditorState<Profile> => ({ busy: false, uncertain: false, conflict: false, latest: null, saved: null, failure: null });
  let state = empty(); let disposed = false;
  const original = port.initial;
  let revision = original?.revision ?? 0;
  const creation = createDealerCreation<Input, Profile>(port);
  const listeners = new Set<(value: DealerEditorState<Profile>) => void>();
  function publish(patch: Partial<DealerEditorState<Profile>>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch }); for (const listener of listeners) listener(state);
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (value: DealerEditorState<Profile>) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    async save(input: Input) {
      if (disposed || state.busy || state.conflict || state.saved) return;
      publish({ busy: true, failure: null });
      try {
        const saved = original ? await port.update(original.id, { ...input }, revision) : await creation.submit(input);
        publish({ saved, uncertain: false });
      } catch (failure) {
        publish({ failure, conflict: Boolean(original && port.conflict(failure)), latest: null, uncertain: !original && creation.pending() });
      } finally { publish({ busy: false }); }
    },
    async review() {
      if (disposed || state.busy || !state.conflict || !original) return;
      publish({ busy: true, failure: null });
      try {
        const latest = await port.get(original.id);
        if (latest.id !== original.id || !Number.isSafeInteger(latest.revision) || latest.revision < revision) throw new Error('invalid_profile_revision');
        publish({ latest });
      } catch (failure) { publish({ failure, latest: null }); }
      finally { publish({ busy: false }); }
    },
    keepEdits() {
      if (disposed || state.busy || !state.conflict || !state.latest) return;
      revision = state.latest.revision;
      publish({ conflict: false, latest: null, failure: null });
    },
    dispose() { disposed = true; state = empty(); listeners.clear(); },
  });
}
