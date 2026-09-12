import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

const CHAT_ISSUER = "chat@system.gserviceaccount.com";

/** Decodes the token for logging ONLY — never treat this as verified. */
function describeToken(token: string): string {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return `aud="${claims.aud}" email="${claims.email}" iss="${claims.iss}"`;
  } catch {
    return "(could not decode)";
  }
}

/**
 * Verifies the bearer token Google Chat attaches to every request it sends
 * to this service, per
 * https://developers.google.com/workspace/chat/authenticate-authorize-chat-app.
 *
 * Google issues these with one of two audiences depending on how the app is
 * registered: the Cloud project number, or the configured HTTP endpoint URL.
 * Both are accepted (each is a value we control); the signature is still
 * fully verified against Google's certs either way. With neither configured,
 * requests pass through unverified — the local-dev/test posture, not a safe
 * default for a deployed instance.
 */
export function createChatRequestVerifier(projectNumber?: string, audienceUrl?: string) {
  const audiences = [projectNumber, audienceUrl].filter((a): a is string => Boolean(a));
  // A plain Chat app's tokens come from CHAT_ISSUER; an app registered as a
  // Workspace add-on signs with its own project's add-on service account.
  // Deriving it from the project number keeps this scoped to our project
  // rather than trusting every gcp-sa-gsuiteaddons account.
  const allowedIssuers = [
    CHAT_ISSUER,
    ...(projectNumber ? [`service-${projectNumber}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`] : []),
  ];
  if (audiences.length === 0) {
    let warned = false;
    return async function passThrough(_req: Request, _res: Response, next: NextFunction) {
      if (!warned) {
        // eslint-disable-next-line no-console
        console.warn(
          "Neither GOOGLE_CHAT_PROJECT_NUMBER nor GOOGLE_CHAT_AUDIENCE is set — chat webhook " +
            "requests are NOT being verified. Set one before deploying anywhere internet-reachable.",
        );
        warned = true;
      }
      next();
    };
  }

  const client = new OAuth2Client();
  return async function verifyChatRequest(req: Request, res: Response, next: NextFunction) {
    const header = req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    try {
      const ticket = await client.verifyIdToken({ idToken: token, audience: audiences });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !allowedIssuers.includes(payload.email)) {
        // eslint-disable-next-line no-console
        console.warn(
          `Rejected token: issuer not in [${allowedIssuers.join(", ")}]. Token: ${describeToken(token)}`,
        );
        res.status(401).json({ error: "Token not issued by Google Chat" });
        return;
      }
      next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `Rejected token: ${err instanceof Error ? err.message : err}. ` +
          `Accepted audiences: ${audiences.join(", ")}. Token: ${describeToken(token)}`,
      );
      res.status(401).json({ error: "Invalid bearer token" });
    }
  };
}
