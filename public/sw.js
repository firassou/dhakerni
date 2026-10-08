/*
 * Dhakerni service worker: offline shell, Web Push, and notification actions.
 * It talks to the same IndexedDB as the app (tasks, profile, meta) so "Done" and "Snooze" work even when
 * the app is closed. Keep the store names in step with src/lib/db/index.ts.
 */
const CACHE = "dhakerni-shell-v3";
const SHELL = ["/", "/settings", "/manifest.webmanifest"];
const DB_NAME = "dhakerni";
const DEFAULT_SNOOZE_MIN = 10;
const VIBRATE = [400, 200, 400, 200, 800]; // long enough to feel in a pocket
// Keep in step with src/lib/reminders/engine.ts.
const EARLY_SUFFIX = "~early"; // the server's id for a task's earlier reminder ("an hour before")
const DIGEST_ID = "digest"; // the evening summary: not a task, nothing to answer

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
  if (taskId === DIGEST_ID) {
    return self.registration.showNotification(title, {
      tag: DIGEST_ID,
      data: {},
      lang: L.lang,
      dir: L.dir,
      icon: "/icons/icon-192.png",
    });
  }
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
      // The earlier reminder of a task travels under the task's id plus a suffix.
      const taskId = data.taskId ? String(data.taskId).split(EARLY_SUFFIX)[0] : "";
      let minutes = DEFAULT_SNOOZE_MIN;
      try {
        const db = await openDb();
        minutes = await snoozeMinutes(db);
        const task = taskId && taskId !== DIGEST_ID && (await getTask(db, taskId));
        if (task && !task.done) {
          // Remember it was shown, so opening the app does not alert a second time.
          await putTask(db, { ...task, notifiedAt: new Date().toISOString() });
          tellClients();
        }
      } catch {
        /* the notification matters more than the bookkeeping */
      }
      await show(data.title || "Dhakerni", taskId || "x", minutes);
    })(),
  );
});

/*
 * The next date of a repeating task, strictly after now: same clock time, on the next day its rule allows.
 * The same rules as src/lib/tasks/recur.ts (nextDue), which has the tests. Keep the two in step.
 */
function nextDue(task, now) {
  const rule = task.recurrence;
  if (!rule || !task.dueAt) return null;
  const base = new Date(task.dueAt);
  const every = Math.max(1, rule.interval || 1);
  const days = rule.byWeekday && rule.byWeekday.length ? new Set(rule.byWeekday) : null;
  const at = (y, m, d) => new Date(y, m, d, base.getHours(), base.getMinutes(), 0, 0);
  const sunday = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
  for (let i = 1; i <= 1000; i++) {
    let next;
    if (rule.freq === "monthly") {
      const first = new Date(base.getFullYear(), base.getMonth() + i * every, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      next = at(first.getFullYear(), first.getMonth(), Math.min(base.getDate(), last));
    } else if (rule.freq === "weekly" && days) {
      next = at(base.getFullYear(), base.getMonth(), base.getDate() + i);
      if (!days.has(next.getDay())) continue;
      if (Math.round((sunday(next) - sunday(base)) / (7 * 86_400_000)) % every !== 0) continue;
    } else {
      const step = (rule.freq === "weekly" ? 7 : 1) * every;
      next = at(base.getFullYear(), base.getMonth(), base.getDate() + i * step);
    }
    if (next > now) return next;
  }
  return null;
}

const fireTimesOf = (dueAt, remindBefore) =>
  remindBefore
    ? [new Date(Date.parse(dueAt) - remindBefore * 60_000).toISOString(), dueAt]
    : [dueAt];

async function schedule(db, reminders, cancel) {
  const sub = await self.registration.pushManager.getSubscription();
  const sid = await getMeta(db, "sessionId");
  if (!sub || !sid) return;
  await fetch("/api/reminders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": sid },
    body: JSON.stringify({ subscription: sub.toJSON(), mode: "upsert", reminders, cancel }),
  });
}

/** What the server should hold for this task: its time, and its earlier reminder when still ahead. */
function serverReminders(task) {
  const out = [{ taskId: task.id, fireAt: task.dueAt, title: task.title }];
  const early = task.remindBefore && Date.parse(task.dueAt) - task.remindBefore * 60_000;
  if (early && early > Date.now()) {
    const d = new Date(task.dueAt);
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    out.unshift({
      taskId: `${task.id}${EARLY_SUFFIX}`,
      fireAt: new Date(early).toISOString(),
      title: `${task.title} (${clock})`,
      once: true,
    });
  }
  return out;
}

async function markDone(taskId) {
  const db = await openDb();
  const task = await getTask(db, taskId);
  const next = task && !task.done ? nextDue(task, new Date()) : null;
  if (next) {
    // A repeating task is not put away: it moves to its next date, and that date goes to the server now,
    // so tomorrow's reminder arrives even if the app is never opened in between.
    const dueAt = next.toISOString();
    const moved = {
      ...task,
      dueAt,
      reminders: fireTimesOf(dueAt, task.remindBefore),
      notifiedAt: null,
      items: (task.items || []).map((i) => ({ ...i, done: false })),
      subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })),
      updatedAt: new Date().toISOString(),
    };
    await putTask(db, moved);
    try {
      await schedule(db, serverReminders(moved), []);
    } catch {
      /* offline: the app sends it the next time it is opened */
    }
    return;
  }
  if (task) {
    const now = new Date().toISOString();
    await putTask(db, { ...task, done: true, doneAt: now, updatedAt: now });
  }
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
        cancel: [taskId, `${taskId}${EARLY_SUFFIX}`],
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
  if (task.dueAt && task.remindBefore && Date.now() < Date.parse(task.dueAt)) {
    // Snoozing the earlier reminder leaves the appointment where it is: only the heads-up comes again
    // (or is dropped, when the time itself is nearer than the snooze). Same rule as snoozed() in the app.
    const left = Math.floor((Date.parse(task.dueAt) - Date.parse(at)) / 60_000);
    const moved = {
      ...task,
      remindBefore: left > 0 ? left : null,
      reminders: left > 0 ? [at, task.dueAt] : [task.dueAt],
      notifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await putTask(db, moved);
    try {
      await schedule(db, serverReminders(moved), left > 0 ? [] : [`${taskId}${EARLY_SUFFIX}`]);
    } catch {
      /* the time itself is already on the server */
    }
    return;
  }
  await putTask(db, {
    ...task,
    dueAt: at,
    reminders: [at],
    remindBefore: null,
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

// The browser replaced the push address (it does, now and then). The server still holds the old one, and
// every reminder would go nowhere until the app is next opened. Subscribe again and tell the server now.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const options = event.oldSubscription && event.oldSubscription.options;
        const sub =
          event.newSubscription ||
          (options &&
            (await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: options.applicationServerKey,
            })));
        if (!sub) return;
        const sid = await getMeta(await openDb(), "sessionId");
        if (!sid) return;
        await fetch("/api/reminders", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": sid },
          body: JSON.stringify({ subscription: sub.toJSON(), mode: "upsert", reminders: [] }),
        });
      } catch {
        /* the app repairs it the next time it is opened */
      }
    })(),
  );
});

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
