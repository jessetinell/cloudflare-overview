// OpenNext's worker, wrapped with the Access check and our cron.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore generated at build time (.open-next/worker.js)
import { default as handler } from "./.open-next/worker.js";
import { verifyAccess } from "./lib/access";
import { runSync } from "./lib/sync";

export default {
  // Every request (pages, assets, server actions) must carry a valid Access JWT.
  async fetch(req, env, ctx) {
    if (!(await verifyAccess(req.headers.get("cf-access-jwt-assertion"), env))) return new Response("Forbidden", { status: 403 });
    return handler.fetch(req, env, ctx);
  },
  // The only scheduled entry point.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSync(env).then((r) => console.log("sync", r), (e) => console.error("sync failed", e)));
  },
} satisfies ExportedHandler<CloudflareEnv>;
