/**
 * Keep-alive endpoint for an external uptime pinger. Deliberately does NOT touch the
 * database, so pinging it keeps the web server awake without keeping the database awake.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
