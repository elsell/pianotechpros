/** One flat profile submission survives uncertain transport outcomes unchanged. */
export function createDealerCreation<Profile extends object, Result>(port: {
  key(): string;
  create(profile: Profile, key: string): Promise<Result>;
  rejectedBeforeCreation(error: unknown): boolean;
}) {
  let intent: { profile: Profile; key: string } | null = null;
  let active: Promise<Result> | null = null;
  return Object.freeze({
    pending: () => intent !== null,
    submit(profile: Profile): Promise<Result> {
      if (active) return active;
      intent ??= { profile: Object.freeze({ ...profile }), key: port.key() };
      const submitted = intent;
      const request = Promise.resolve().then(() => port.create(submitted.profile, submitted.key));
      active = request.then((result) => { intent = null; active = null; return result; }, (error) => {
        if (port.rejectedBeforeCreation(error)) intent = null;
        active = null;
        throw error;
      });
      return active;
    },
  });
}
