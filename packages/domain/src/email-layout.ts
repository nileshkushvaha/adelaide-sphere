/**
 * The one layout every transactional email uses — password reset, account
 * setup, business enquiries — rendered as HTML and as plain text from the same
 * content, so the two parts can never say different things (SRS ENQ 005:
 * "escape visitor content in HTML and supply a plain text body").
 *
 * Written the way email has to be written, not the way web pages are:
 *
 *  * tables for layout and inline styles, because most mail clients ignore
 *    stylesheets and flexbox;
 *  * the brand gradient as a `background-image` over a solid `background-color`
 *    and `bgcolor`, so clients that drop gradients (Gmail, Outlook) still show
 *    the brand colour with a readable button;
 *  * a hidden preview line for the inbox list, a copy-and-paste fallback under
 *    every button, `lang`, and presentation roles on layout tables;
 *  * dark-mode overrides for the clients that honour `prefers-color-scheme`.
 *
 * Every string is escaped here, and a link must be http(s) — a caller cannot
 * put markup or a `javascript:` URL into a message by accident.
 *
 * The colours are the admin's light palette (apps/admin/src/config/theme.ts);
 * email clients cannot read CSS variables, so they are written out.
 */

export interface EmailAction {
  label: string;
  url: string;
  /** A line under the button, e.g. how long the link lasts. */
  note?: string;
}

export interface EmailContent {
  /** Shown in the inbox list after the subject; never visible in the message. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: EmailAction;
  /** Label/value pairs, e.g. who sent an enquiry. */
  details?: { label: string; value: string }[];
  /** Someone else's words (a visitor's message), shown set apart and escaped. */
  quote?: { label: string; text: string };
  /** Smaller text after the main content. */
  closing?: string[];
  /** Why the reader received this message. */
  footer: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const BRAND = 'Adelaide Sphere';

const COLOURS = {
  ground: '#F4F7FB',
  card: '#FFFFFF',
  navy: '#012169',
  navyLit: '#1C3F8A',
  primary: '#0B3AA4',
  primaryDeep: '#082C80',
  teal: '#C8102E',
  indigo: '#4F46E5',
  text: '#0F172A',
  body: '#334155',
  muted: '#475569',
  subtle: '#5F6F85',
  border: '#E2E8F0',
  inset: '#F8FAFC',
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

/** Escaped, with line breaks kept — for a visitor's own message. */
function escapeMultiline(value: string): string {
  return escapeHtml(value.replace(/\r\n?/g, '\n').trim()).replace(/\n/g, '<br>');
}

/** Only an absolute http(s) address may become a link. */
function safeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('An email link must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('An email link must use http or https');
  return parsed.toString();
}

function paragraph(text: string, style = `margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLOURS.body};`): string {
  return `<p class="ms-body-text" style="${style}">${escapeHtml(text)}</p>`;
}

function renderAction(action: EmailAction): string {
  const url = escapeHtml(safeUrl(action.url));
  const label = escapeHtml(action.label);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">
  <tr>
    <td bgcolor="${COLOURS.primary}" style="border-radius:10px;background-color:${COLOURS.primary};background-image:linear-gradient(135deg,${COLOURS.primaryDeep} 0%,${COLOURS.primary} 50%,${COLOURS.teal} 100%);">
      <a class="ms-button" href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:10px;">${label}</a>
    </td>
  </tr>
</table>
${action.note ? paragraph(action.note, `margin:0 0 20px;font-size:13px;line-height:1.5;color:${COLOURS.muted};`) : ''}
<p class="ms-muted" style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${COLOURS.muted};">If the button does not work, copy this address into your browser:<br><a href="${url}" target="_blank" rel="noopener" style="color:${COLOURS.primary};word-break:break-all;">${url}</a></p>`;
}

function renderDetails(details: NonNullable<EmailContent['details']>): string {
  const rows = details
    .map(
      ({ label, value }) => `
  <tr>
    <td class="ms-muted" style="padding:8px 16px 8px 0;font-size:13px;line-height:1.4;color:${COLOURS.subtle};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td class="ms-heading" style="padding:8px 0;font-size:14px;line-height:1.4;color:${COLOURS.text};word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;border-top:1px solid ${COLOURS.border};border-bottom:1px solid ${COLOURS.border};">${rows}
</table>`;
}

function renderQuote(quote: NonNullable<EmailContent['quote']>): string {
  return `
<p class="ms-muted" style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.02em;color:${COLOURS.subtle};">${escapeHtml(quote.label)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr>
    <td class="ms-inset" bgcolor="${COLOURS.inset}" style="padding:16px 18px;background-color:${COLOURS.inset};border-left:4px solid ${COLOURS.primary};border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;color:${COLOURS.text};">${escapeMultiline(quote.text)}</td>
  </tr>
</table>`;
}

function renderHtml(content: EmailContent): string {
  const preheader = escapeHtml(content.preheader);
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.heading)}</title>
<style>
  body { margin: 0; padding: 0; width: 100% !important; }
  a { color: ${COLOURS.primary}; }
  @media (max-width: 620px) {
    .ms-card { padding: 28px 22px !important; }
    .ms-heading-1 { font-size: 20px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .ms-ground { background-color: #0A1322 !important; }
    .ms-card { background-color: #101B2E !important; }
    .ms-heading, .ms-heading-1 { color: #E6EDF5 !important; }
    .ms-body-text { color: #CBD5E1 !important; }
    .ms-muted { color: #B3C0D1 !important; }
    .ms-inset { background-color: #15223A !important; color: #E6EDF5 !important; }
    a { color: #B5CBFF !important; }
    /* The button keeps its white label: the rule above is for text links. */
    a.ms-button { color: #FFFFFF !important; }
  }
</style>
</head>
<body class="ms-ground" style="margin:0;padding:0;background-color:${COLOURS.ground};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOURS.ground};">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" class="ms-ground" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOURS.ground}" style="background-color:${COLOURS.ground};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
        <tr>
          <td bgcolor="${COLOURS.navy}" style="padding:22px 32px;background-color:${COLOURS.navy};background-image:linear-gradient(135deg,${COLOURS.navy} 0%,${COLOURS.navyLit} 100%);border-radius:16px 16px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:28px;height:28px;border-radius:14px;background-color:${COLOURS.primary};background-image:linear-gradient(135deg,#1747B8 0%,${COLOURS.primary} 100%);font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding-left:12px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:0.01em;color:#FFFFFF;">${BRAND}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${COLOURS.primary}" style="height:4px;font-size:0;line-height:0;background-color:${COLOURS.primary};background-image:linear-gradient(90deg,${COLOURS.primary} 0%,${COLOURS.teal} 55%,${COLOURS.indigo} 100%);">&nbsp;</td>
        </tr>
        <tr>
          <td class="ms-card" bgcolor="${COLOURS.card}" style="padding:36px 36px 28px;background-color:${COLOURS.card};border-radius:0 0 16px 16px;font-family:${FONT};">
            <h1 class="ms-heading-1" style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${COLOURS.text};">${escapeHtml(content.heading)}</h1>
            ${content.paragraphs.map((text) => paragraph(text)).join('\n            ')}
            ${content.details?.length ? renderDetails(content.details) : ''}
            ${content.quote ? renderQuote(content.quote) : ''}
            ${content.action ? renderAction(content.action) : ''}
            ${(content.closing ?? []).map((text) => paragraph(text, `margin:0 0 12px;font-size:14px;line-height:1.6;color:${COLOURS.muted};`)).join('\n            ')}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px 0;font-family:${FONT};">
            <p class="ms-muted" style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${COLOURS.subtle};">${escapeHtml(content.footer)}</p>
            <p class="ms-muted" style="margin:0;font-size:12px;line-height:1.5;color:${COLOURS.subtle};">${BRAND} · Adelaide, Australia</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderText(content: EmailContent): string {
  const blocks: string[] = [content.heading, ...content.paragraphs];
  if (content.details?.length) blocks.push(content.details.map(({ label, value }) => `${label}: ${value}`).join('\n'));
  if (content.quote) {
    const label = content.quote.label.toLowerCase();
    blocks.push(`--- ${label} ---\n${content.quote.text.replace(/\r\n?/g, '\n').trim()}\n--- end of ${label} ---`);
  }
  if (content.action) {
    blocks.push(`${content.action.label}:\n${safeUrl(content.action.url)}`);
    if (content.action.note) blocks.push(content.action.note);
  }
  blocks.push(...(content.closing ?? []));
  blocks.push(`—\n${content.footer}\n${BRAND} · Adelaide, Australia`);
  return blocks.join('\n\n');
}

/** Renders one message as HTML and plain text from the same content. */
export function renderEmail(content: EmailContent): RenderedEmail {
  return { html: renderHtml(content), text: renderText(content) };
}
