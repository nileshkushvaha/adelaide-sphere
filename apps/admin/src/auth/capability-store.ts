/**
 * The effective permission codes the server last returned, held outside React
 * because Refine calls `accessControlProvider.can` outside a component tree.
 *
 * One owner, two operations: `withCapabilityLifecycle` writes it as the session
 * changes and the access-control provider reads it. Nothing else should hold a
 * copy — a second cache is a second thing that can be stale.
 */
const state: { codes: string[] | undefined } = { codes: undefined };

export const capabilityStore = {
  /** `undefined` means "not known yet"; an empty array means "knows, and holds nothing". */
  get(): string[] | undefined {
    return state.codes;
  },
  set(codes: string[] | undefined): void {
    state.codes = codes;
  },
};
