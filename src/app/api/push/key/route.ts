import { pushConfigured } from "@/lib/server/push";
import { health, STALLED_MS } from "@/lib/server/reminders";
import { qstashConfigured } from "@/lib/server/schedule";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const RECENT_MS = 3 * 60_000;

/**
 * Public VAPID key, so the client can subscribe. `enabled` is false when the server cannot deliver push.
 * `background` says whether reminders are really being sent with the app closed: "stalled" when one has been
 * waiting too long, or when nothing has triggered the server lately and no exact scheduler is set up.
 */
export async function GET() {
  const store = getStore();
  const enabled = pushConfigured() && store !== null;
  let background: "ok" | "stalled" | null = null;
  if (enabled && store) {
    try {
      const now = new Date();
      const h = await health(store, now);
      const ranLately = h.lastRunMs !== null && now.getTime() - h.lastRunMs < RECENT_MS;
      background = h.lateMs > STALLED_MS || !(ranLately || qstashConfigured()) ? "stalled" : "ok";
    } catch (e) {
      console.error("health check failed", e);
    }
  }
  return Response.json({ enabled, key: enabled ? process.env.VAPID_PUBLIC_KEY : null, background });
}
