import "server-only";
import { q } from "./db";

/**
 * Message gateway. In the internal trial every SMS/email is written to the outbox
 * (visible at /dev/outbox). At launch, replace the body of sendMessage with the
 * licensed SMS provider call – nothing else in the system changes.
 */
export async function sendMessage(target: string, body: string) {
  const channel = target.includes("@") ? "email" : "sms";
  await q(`INSERT INTO outbox(channel,target,body) VALUES ($1,$2,$3)`, [channel, target, body]);
}
