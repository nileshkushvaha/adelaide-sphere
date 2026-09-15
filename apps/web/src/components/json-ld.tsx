import { serialiseJsonLd, type JsonLd } from '@/lib/structured-data';

/**
 * Renders structured data. The serialiser escapes `<`, `>` and `&`, so editor
 * text can never close the script element (SRS SEO 007).
 */
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }} />;
}
