import 'server-only';
import { absoluteUrl } from './site';

/** XML text escaping (SRS SEO 007): a slug or path can never break the document. */
export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const isoDay = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export function sitemapIndexXml(sections: { path: string; lastModified: string }[]): string {
  const entries = sections
    .map((section) => `  <sitemap><loc>${escapeXml(absoluteUrl(section.path))}</loc><lastmod>${escapeXml(isoDay(section.lastModified))}</lastmod></sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function urlSetXml(entries: { path: string; lastModified: string }[]): string {
  const urls = entries
    .map((entry) => `  <url><loc>${escapeXml(absoluteUrl(entry.path))}</loc><lastmod>${escapeXml(isoDay(entry.lastModified))}</lastmod></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
