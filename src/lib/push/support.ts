export type PushState =
  "loading" | "unsupported" | "ios-install" | "server-off" | "default" | "denied" | "enabled";

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushApisPresent = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const isAndroid = () => /Android/.test(navigator.userAgent);

export const isFirefox = () => /Firefox\//.test(navigator.userAgent);
