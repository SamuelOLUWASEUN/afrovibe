import type { IncomingMessage } from "node:http";

/**
 * The caller's IP. X-Forwarded-For is only honoured when TRUST_PROXY=true, because
 * without a proxy in front it is just a header the client can set to anything.
 * We take the LAST entry, which is the one appended by our own proxy; earlier
 * entries are client-supplied and spoofable.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    const raw = Array.isArray(header) ? header.join(",") : header;
    const last = raw
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}
