import { pushConfigured } from "@/lib/server/push";
import { getStore } from "@/lib/server/store";

/** Public VAPID key, so the client can subscribe. `enabled` is false when the server cannot deliver push. */
export function GET() {
  const enabled = pushConfigured() && getStore() !== null;
  return Response.json({ enabled, key: enabled ? process.env.VAPID_PUBLIC_KEY : null });
}
