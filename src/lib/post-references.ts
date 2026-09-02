const DEFAULT_SITE_ORIGIN = "https://dgddgd314.github.io";

/**
 * Finds exact internal post targets in rich-text links and bookmark blocks.
 * Text that merely contains a URL (for example, code blocks) is ignored.
 */
export function extractInternalPostReferences(
  blocks: unknown[],
  siteOrigin = DEFAULT_SITE_ORIGIN,
): string[] {
  const references = new Set<string>();
  const visited = new WeakSet<object>();
  let siteUrl: URL;

  try {
    siteUrl = new URL(siteOrigin);
  } catch {
    siteUrl = new URL(DEFAULT_SITE_ORIGIN);
  }

  const collectUrl = (value: string) => {
    let url: URL;
    try {
      url = new URL(value, siteUrl);
    } catch {
      return;
    }

    if (url.hostname !== siteUrl.hostname) return;
    const match = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
    if (!match) return;

    try {
      references.add(decodeURIComponent(match[1]));
    } catch {
      references.add(match[1]);
    }
  };

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.href === "string") collectUrl(record.href);
    if (record.type === "bookmark" && typeof record.url === "string") collectUrl(record.url);
    Object.values(record).forEach(visit);
  };

  visit(blocks);
  return Array.from(references);
}
