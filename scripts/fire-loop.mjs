// Local stand-in for a production scheduler: asks the app to send due reminders every 20 seconds.
// Run next to `npm run dev`:  npm run dev:cron
const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set (run through npm run dev:cron so .env.local is loaded)");
  process.exit(1);
}
console.log(`firing due reminders at ${base}/api/cron/fire every 20s`);
for (;;) {
  try {
    const res = await fetch(`${base}/api/cron/fire`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await res.json();
    if (body.sent || body.failed || body.dropped)
      console.log(new Date().toLocaleTimeString(), JSON.stringify(body));
  } catch (e) {
    console.error("fire failed:", e.message);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
