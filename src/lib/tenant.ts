/**
 * Tenant resolution strategy:
 *  - Production: subdomain  (rosa-bela.scalius.com.br)
 *  - Dev/preview: ?store=slug  (localhost)
 *  - Future: custom domain table lookup (already typed in Store.custom_domain)
 *
 * Reserved subdomains are NOT treated as tenants (www, app, admin, api, etc.)
 */

const RESERVED = new Set([
  "www", "app", "admin", "api", "auth", "static", "cdn",
  "preview", "localhost",
]);

const ROOT_HOSTS = new Set(["scalius.com.br"]);
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isIpHost(host: string): boolean {
  return IPV4_HOST.test(host) || host.includes(":");
}

export function resolveTenantSlug(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);

  // 1) Dev override via query string — always wins
  const qs = url.searchParams.get("store");
  if (qs) return qs;

  // 2) Subdomain detection
  const host = url.hostname;
  if (isIpHost(host)) return null;

  const parts = host.split(".");

  // Strip known root suffix
  let candidate: string | null = null;
  if (parts.length >= 3) {
    candidate = parts[0];
  }

  if (!candidate) return null;
  if (RESERVED.has(candidate)) return null;
  if (ROOT_HOSTS.has(host)) return null;



  return candidate;
}

export function getStoreLink(path: string, slug: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const isSubdomain = !!resolveTenantSlug();
  
  if (isSubdomain) {
    return `/${cleanPath}`;
  }
  return `/loja/${slug}/${cleanPath}`;
}
