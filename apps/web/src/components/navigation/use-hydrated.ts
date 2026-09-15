import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False in the server render and during hydration, true afterwards. Lets the
 * navigation render its no-JavaScript form first and switch to the enhanced
 * one only once its event handlers actually exist.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
