# Renewing tokens

API tokens should have an expiry date (the Security tab flags ones that don't), so plan to renew yearly. Check the date on the [API tokens page](https://dash.cloudflare.com/profile/api-tokens).

**Signs a token has expired**
- The read token: the dashboard stops updating. "Synced … ago" keeps growing, and the Projects page shows a "checks skipped" banner.
- The stop token: the Stop buttons fail with an error.

## What to renew

| Secret | Expires | Where it comes from |
|---|---|---|
| `CF_READ_TOKEN` | yes | API token from the **"Read all resources"** template. Account: yours. Zones: all. |
| `CF_STOP_TOKEN` | yes | Custom API token with these permissions: Account › Workers Scripts › Edit, Account › Queues › Edit, Zone › Workers Routes › Edit (all zones). |
| `ALERT_WEBHOOK_URL` | no | Slack incoming webhook. Only needed if you delete or change it. |
| Access login provider | no | Whatever identity provider your Access app uses. Only if you change it. |

## Steps

1. **Get a new token.** On the [API tokens page](https://dash.cloudflare.com/profile/api-tokens), open the **⋯** menu on the expiring token and choose **Roll**, or create a new token with the same permissions. Give it a **1 year** expiry. Copy the value.
2. **Add it to the Worker.** Run `npx wrangler secret put CF_READ_TOKEN` (or `CF_STOP_TOKEN`) and paste the value. Or: dashboard → Workers → cf-overview → Settings → Variables and Secrets.
3. **Update local dev**, if you still use it. Paste the same value into `.dev.vars`.
4. **Check that it works.**
   - Open your dashboard and press refresh. "Synced just now" should appear and the banner should be gone.
   - After renewing the stop token, open Settings. The Stop buttons and Auto-stop checkboxes should be there.
5. **Clean up.** Delete the old token if you created a new one rather than rolling. Set a calendar reminder for next year.

Never paste tokens into a chat, a commit or a terminal command. They belong only in the Worker secrets and in `.dev.vars`, which is gitignored.
