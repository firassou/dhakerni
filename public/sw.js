/*
 * Dhakerni service worker: offline shell, Web Push, and notification actions.
 * It talks to the same IndexedDB as the app (tasks, profile, meta) so "Done" and "Snooze" work even when
 * the app is closed. Keep the store names in step with src/lib/db/index.ts.
 */
const CACHE = "dhakerni-shell-v2";
const SHELL = ["/", "/settings", "/manifest.webmanifest"];
const DB_NAME = "dhakerni";
const DEFAULT_SNOOZE_MIN = 10;
const VIBRATE = [400, 200, 400, 200, 800]; // long enough to feel in a pocket

const TEXT = {
  en: { done: "Done", snooze: "Snooze", open: "Open", body: "Reminder", dir: "ltr", lang: "en" },
  fr: {
    done: "Terminé",
    snooze: "Reporter",
    open: "Ouvrir",
    body: "Rappel",
    dir: "ltr",
    lang: "fr",
  },
  ar: { done: "خلصت", snooze: "أجّل", open: "حلّ", body: "تذكير", dir: "rtl", lang: "ar-TN" },
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, fall back to cache: fresh online, still opens offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (self.location.hostname === "localhost" && url.pathname.startsWith("/_next/")) return; // never cache dev assets
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
  );
});

/* ---------- IndexedDB (raw, no library) ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    // The app has never run on this device: do not create an empty database behind its back.
    req.onupgradeneeded = (e) => e.target.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function getTask(db, id) {
  return wrap(db.transaction("tasks").objectStore("tasks").get(id));
}
async function putTask(db, task) {
  await wrap(db.transaction("tasks", "readwrite").objectStore("tasks").put(task));
}
async function getMeta(db, key) {
  return wrap(db.transaction("meta").objectStore("meta").get(key));
}
async function snoozeMinutes(db) {
  const fact = await wrap(
    db.transaction("profile").objectStore("profile").index("by-key").get("snooze.default"),
  );
  // A habit that has only been noticed once is not trusted yet (same threshold as the app).
  const n = fact && fact.confidence >= 0.6 ? Number(fact.value) : 0;
  return n > 0 ? n : DEFAULT_SNOOZE_MIN;
}

async function textFor() {
  try {
    const db = await openDb();
    return TEXT[await getMeta(db, "locale")] || TEXT.en;
  } catch {
    return TEXT.en;
  }
}

async function tellClients() {
  for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
    c.postMessage({ type: "tasks-changed" });
  }
}

/* ---------- Push ---------- */

async function show(title, taskId, minutes) {
  const L = await textFor();
  const actions = [
    { action: "done", title: L.done },
    { action: "snooze", title: `${L.snooze} ${minutes}'` },
    { action: "open", title: L.open },
  ];
  return self.registration.showNotification(title, {
    body: L.body,
    tag: `task-${taskId}`, // a second copy for the same task replaces the first
    data: { taskId },
    actions,
    lang: L.lang,
    dir: L.dir,
    icon: "/icons/icon-192.png",
    requireInteraction: true,
    // The server repeats an unanswered reminder: each copy must buzz again, not replace the first in silence.
    renotify: true,
    vibrate: VIBRATE,
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data.json();
      } catch {
        /* a push with no usable payload still has to show something */
      }
      let minutes = DEFAULT_SNOOZE_MIN;
      try {
        const db = await openDb();
        minutes = await snoozeMinutes(db);
        const task = data.taskId && (await getTask(db, data.taskId));
        if (task && !task.done) {
          // Remember it was shown, so opening the app does not alert a second time.
          await putTask(db, { ...task, notifiedAt: new Date().toISOString() });
          tellClients();
        }
      } catch {
        /* the notification matters more than the bookkeeping */
      }
      await show(data.title || "Dhakerni", data.taskId || "x", minutes);
    })(),
  );
});

async function markDone(taskId) {
  const db = await openDb();
  const task = await getTask(db, taskId);
  if (!task) return;
  const now = new Date().toISOString();
  await putTask(db, { ...task, done: true, doneAt: now, updatedAt: now });
  // Tell the server to stop repeating this reminder.
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const sid = await getMeta(db, "sessionId");
    if (!sub || !sid) return;
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sid },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        mode: "upsert",
        reminders: [],
        cancel: [taskId],
      }),
    });
  } catch {
    /* offline: it repeats at most twice more */
  }
}

async function snooze(taskId) {
  const db = await openDb();
  const task = await getTask(db, taskId);
  if (!task) return;
  const minutes = await snoozeMinutes(db);
  const at = new Date(Date.now() + minutes * 60_000).toISOString();
  await putTask(db, {
    ...task,
    dueAt: at,
    reminders: [at],
    notifiedAt: null,
    updatedAt: new Date().toISOString(),
  });
  // Schedule the new time on the server too, so it fires with the app closed.
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const sid = await getMeta(db, "sessionId");
    if (!sub || !sid) return;
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sid },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        mode: "upsert",
        reminders: [{ taskId, fireAt: at, title: task.title }],
      }),
    });
  } catch {
    /* in-app timer still covers it when the app is open */
  }
}

self.addEventListener("notificationclick", (event) => {
  const { taskId } = event.notification.data || {};
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (event.action === "done" && taskId) {
        await markDone(taskId).catch(() => {});
        return tellClients();
      }
      if (event.action === "snooze" && taskId) {
        await snooze(taskId).catch(() => {});
        return tellClients();
      }
      // Open (or a plain click, which is all Firefox on desktop offers): show the app on that task.
      const url = taskId ? `/?task=${encodeURIComponent(taskId)}` : "/";
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        existing.postMessage({ type: "focus-task", taskId });
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
