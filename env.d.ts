// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
interface CloudflareEnv {
  /** This dashboard's own Worker name; the emergency stop never touches it. */
  WORKER_NAME?: string;
  CF_READ_TOKEN: string;
  CF_STOP_TOKEN?: string;
  ALERT_WEBHOOK_URL?: string;
}
