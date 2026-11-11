import { createRemoteJWKSet, jwtVerify } from "jose";

// Defense in depth behind Cloudflare Access: verifies the Access JWT so a forgotten
// workers.dev / preview URL can't bypass login. No login logic lives here.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

interface AccessConfig {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export async function verifyAccess(token: string | null, cfg: AccessConfig, dev = false): Promise<boolean> {
  const team = cfg.ACCESS_TEAM_DOMAIN;
  const aud = cfg.ACCESS_AUD;
  if (!team || !aud || team.startsWith("REPLACE") || aud.startsWith("REPLACE")) return dev; // fail closed outside `next dev`
  if (!token) return false;
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
    return true;
  } catch {
    return false;
  }
}

/** Call at the top of every Server Action, in addition to the check in custom-worker.ts. */
export async function requireAccess() {
  if (process.env.NODE_ENV === "development") return; // local `next dev` only; never true in a deployed build
  const { headers } = await import("next/headers");
  const ok = await verifyAccess((await headers()).get("cf-access-jwt-assertion"), process.env);
  if (!ok) throw new Error("Forbidden");
}
