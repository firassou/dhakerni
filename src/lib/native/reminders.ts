import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { upcomingReminders } from "../reminders/engine";
import type { Task } from "../schemas";

/**
 * Reminders inside the Android app. They are handed to Android's own alarm clock, on the phone: they ring at
 * the exact time with the phone asleep, the app closed and no internet, and they survive a restart. Nothing
 * here involves the server, the scheduler or the push service.
 */

/** True inside the Android app (the native shell), false in any browser. */
export const isNativeApp = () => Capacitor.isNativePlatform();

const CHANNEL = "reminders";
const ACTIONS = "reminder";
const MAX_SCHEDULED = 400; // Android allows an app 500 alarms; stay clear of it
export const TEST_ID = 1;

export interface NativeTexts {
  channel: string;
  body: string;
  done: string;
  snooze: string;
}

/**
 * A stable 31-bit number for a task id: Android identifies a notification by an int. 1 is kept for the test.
 */
export function notificationId(taskId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < taskId.length; i++) {
    h ^= taskId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 0x7ffffff0) + 2;
}

export type NativePermission = "granted" | "denied" | "prompt";
const simplify = (display: string): NativePermission =>
  display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";

export const nativePermission = async () =>
  simplify((await LocalNotifications.checkPermissions()).display);

/** Must come from a tap. */
export const requestNativePermission = async () =>
  simplify((await LocalNotifications.requestPermissions()).display);

/**
 * Whether Android lets the app ring at the exact minute. Without it Android may hold a reminder back for
 * several minutes while the phone sleeps.
 */
export async function exactAlarmsAllowed(): Promise<boolean> {
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    return true; // older Android: always allowed
  }
}

/** Opens the Android screen where the person allows exact alarms. */
export const openExactAlarmSetting = () =>
  LocalNotifications.changeExactNotificationSetting().catch(() => {});

let ready: Promise<void> | null = null;
/** The channel decides how a reminder behaves (sound, vibration, heads-up); the action type adds buttons. */
function setup(texts: NativeTexts) {
  ready ??= (async () => {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: texts.channel,
      importance: 5, // heads-up, with sound
      visibility: 1, // shown on the lock screen
      vibration: true,
      lights: true,
    });
  })();
  // The button labels follow the language, so they are registered every time.
  return ready.then(() =>
    LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTIONS,
          actions: [
            { id: "done", title: texts.done },
            { id: "snooze", title: texts.snooze },
          ],
        },
      ],
    }),
  );
}

const describe = (taskId: string, title: string, at: Date, texts: NativeTexts) => ({
  id: notificationId(taskId),
  title,
  body: texts.body,
  channelId: CHANNEL,
  actionTypeId: ACTIONS,
  extra: { taskId },
  schedule: { at, allowWhileIdle: true }, // exact, and allowed to wake a sleeping phone
});

/**
 * Makes the phone's scheduled reminders equal to the tasks: schedules every future reminder, and cancels
 * the ones whose task was finished, deleted or moved. Safe to call as often as the tasks change.
 */
export async function syncNativeReminders(
  tasks: readonly Task[],
  texts: NativeTexts,
  now = new Date(),
) {
  await setup(texts);
  const wanted = upcomingReminders(tasks, now)
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .slice(0, MAX_SCHEDULED)
    .map((r) => describe(r.taskId, r.title, new Date(r.fireAt), texts));
  const keep = new Set(wanted.map((n) => n.id));

  // A task that rang and is still open keeps its notification in the list until it is answered.
  // Done, deleted or snoozed: it is taken away.
  const rung = new Set(
    tasks
      .filter((t) => !t.done && t.dueAt && Date.parse(t.dueAt) <= now.getTime())
      .map((t) => notificationId(t.id)),
  );
  const { notifications: pending } = await LocalNotifications.getPending();
  const stale = pending.filter((n) => !keep.has(n.id) && n.id !== TEST_ID);
  if (stale.length)
    await LocalNotifications.cancel({ notifications: stale.map(({ id }) => ({ id })) });

  const { notifications: shown } = await LocalNotifications.getDeliveredNotifications();
  const answered = shown.filter((n) => n.id !== TEST_ID && !rung.has(n.id));
  if (answered.length)
    await LocalNotifications.removeDeliveredNotifications({ notifications: answered });

  if (wanted.length) await LocalNotifications.schedule({ notifications: wanted });
}

/** A reminder a few seconds from now, to try with the phone locked. */
export async function scheduleNativeTest(title: string, texts: NativeTexts, inSeconds = 20) {
  await setup(texts);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_ID,
        title,
        body: texts.body,
        channelId: CHANNEL,
        schedule: { at: new Date(Date.now() + inSeconds * 1000), allowWhileIdle: true },
      },
    ],
  });
}

export type NativeAction = { taskId: string; action: "done" | "snooze" | "open" };

/** A button on a reminder, or a tap on it. Android opens the app, then this is called. */
export function onNativeAction(handler: (a: NativeAction) => void): () => void {
  const sub = LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const taskId = (event.notification.extra as { taskId?: string } | undefined)?.taskId;
    if (!taskId) return;
    const action =
      event.actionId === "done" ? "done" : event.actionId === "snooze" ? "snooze" : "open";
    handler({ taskId, action });
  });
  return () => void sub.then((s) => s.remove());
}
