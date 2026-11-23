import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPgDb, createPgliteDb, migrate, type Db } from "./db.js";
import { Payments } from "./payments.js";
import { ProfileService } from "./profile-service.js";

/** Process entry point: load config, open the database, start listening, shut down cleanly. */

const config = loadConfig();

async function openDatabase(): Promise<Db | null> {
  if (config.databaseUrl) return createPgDb(config.databaseUrl, config.databaseSsl);
  if (config.production) {
    console.warn("[room-server] DATABASE_URL not set: XP, coins and the shop are disabled");
    return null;
  }
  console.log(`[room-server] dev mode: embedded PGlite database at ${config.pgliteDir}`);
  return createPgliteDb(config.pgliteDir);
}

const db = await openDatabase();
if (db) await migrate(db);
const profiles = db ? new ProfileService(db) : null;
const payments = profiles && config.stripe ? new Payments({ ...config.stripe, webUrl: config.webUrl }, profiles) : null;
if (profiles && !payments) console.log("[room-server] Stripe keys not set: coin purchases disabled (earned coins still work)");
if (config.production && !config.trustProxy) {
  console.warn("[room-server] TRUST_PROXY is off: behind Railway/Render every client shares the proxy's IP for rate limits");
}

const app = createApp({ config, profiles, payments });
app.server.listen(config.port, () => {
  console.log(`[room-server] listening on :${config.port} (ws path /ws)`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[room-server] unhandled rejection", reason);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[room-server] ${signal} received, shutting down`);
  setTimeout(() => process.exit(0), 5_000).unref();
  void app
    .close()
    .then(() => db?.close())
    .finally(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
