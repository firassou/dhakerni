/**
 * Whether the network is usable. The browser's `onLine` only says there is a connection, not that anything
 * answers, so a failed request of ours (see ai/client.ts) also marks the app offline, and any success or the
 * browser's own `online` event marks it online again.
 */
let online = true;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach((l) => l());
}

export const getOnline = () => online;
export const markOnline = () => set(true);
export const markOffline = () => set(false);

export function subscribeOnline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetOnlineForTests() {
  online = true;
  listeners.clear();
}
