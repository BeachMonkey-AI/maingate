import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

const CHAT_ISSUER = "chat@system.gserviceaccount.com";

/**
 * Verifies the bearer token Google Chat attaches to every request it sends
 * to this service, per
 * https://developers.google.com/workspace/chat/authenticate-authorize-chat-app.
 *
 * Requires GOOGLE_CHAT_PROJECT_NUMBER (the Cloud project number of *this*
 * app, not MainGate's data project) to check the token audience. Without it
 * set, requests pass through unverified — that's the local-dev / test
 * posture, not a safe default for a deployed instance.
 */
export function createChatRequestVerifier(projectNumber?: string) {
  if (!projectNumber) {
    let warned = false;
    return async function passThrough(_req: Request, _res: Response, next: NextFunction) {
      if (!warned) {
        // eslint-disable-next-line no-console
        console.warn(
          "GOOGLE_CHAT_PROJECT_NUMBER is not set — chat webhook requests are NOT being verified. " +
            "Set it before deploying anywhere reachable from the internet.",
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
      const ticket = await client.verifyIdToken({ idToken: token, audience: projectNumber });
      const payload = ticket.getPayload();
      if (!payload || payload.email !== CHAT_ISSUER) {
        res.status(401).json({ error: "Token not issued by Google Chat" });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: "Invalid bearer token" });
    }
  };
}
