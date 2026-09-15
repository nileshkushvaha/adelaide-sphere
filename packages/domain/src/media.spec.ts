import { documentRejectionReason, imageRejectionReason, maxBytesFor, mediaKindForMime, objectKeyFor, pdfPageCount, readableFileSize, safeDownloadName, variantDimensions, type ImageFacts } from './media.js';

const facts = (over: Partial<ImageFacts> = {}): ImageFacts => ({ detectedMime: 'image/jpeg', width: 1600, height: 1200, animated: false, bytes: 500_000, ...over });

describe('media validation (SRS MED 001)', () => {
  it('accepts a normal JPEG, PNG or WebP', () => {
    expect(imageRejectionReason(facts(), 'image/jpeg')).toBeNull();
    expect(imageRejectionReason(facts({ detectedMime: 'image/png' }), 'image/png')).toBeNull();
    expect(imageRejectionReason(facts({ detectedMime: 'image/webp' }), 'image/webp')).toBeNull();
  });

  it('rejects every disallowed shape with a specific reason', () => {
    expect(imageRejectionReason(facts({ bytes: 0 }), 'image/jpeg')).toMatch(/empty/);
    expect(imageRejectionReason(facts({ bytes: 11 * 1024 * 1024 }), 'image/jpeg')).toMatch(/10 MB/);
    expect(imageRejectionReason(facts({ detectedMime: null }), 'image/jpeg')).toMatch(/not a recognised image/);
    expect(imageRejectionReason(facts({ detectedMime: 'image/svg+xml' }), 'image/svg+xml')).toMatch(/JPEG, PNG and WebP/);
    expect(imageRejectionReason(facts({ detectedMime: 'application/x-msdownload' }), 'application/x-msdownload')).toMatch(/JPEG, PNG and WebP/);
    // A PNG renamed as a JPEG: the bytes win.
    expect(imageRejectionReason(facts({ detectedMime: 'image/png' }), 'image/jpeg')).toMatch(/do not match/);
    expect(imageRejectionReason(facts({ animated: true }), 'image/jpeg')).toMatch(/Animated/);
    expect(imageRejectionReason(facts({ width: null }), 'image/jpeg')).toMatch(/could not be decoded/);
    expect(imageRejectionReason(facts({ width: 9000, height: 9000 }), 'image/jpeg')).toMatch(/40 megapixels/);
    expect(imageRejectionReason(facts({ width: 100, height: 100 }), 'image/jpeg')).toMatch(/200px/);
  });
});

describe('variant sizing and keys (SRS MED 002–003)', () => {
  it('never upscales and keeps the aspect ratio', () => {
    expect(variantDimensions('card', 1600, 1200)).toEqual({ width: 800, height: 600 });
    expect(variantDimensions('hero', 1600, 1200)).toEqual({ width: 1600, height: 1200 });
    expect(variantDimensions('thumbnail', 1000, 250)).toEqual({ width: 320, height: 80 });
    expect(variantDimensions('hero', 400, 400)).toEqual({ width: 400, height: 400 });
  });

  it('builds random server-side keys and ignores client-supplied path characters', () => {
    expect(objectKeyFor('quarantine', 'asset1', 'jpg', 'abc123')).toBe('quarantine/asset1/abc123.jpg');
    expect(objectKeyFor('media', 'asset1', '../../etc/passwd', 'abc123')).toBe('media/asset1/abc123.etcpasswd');
    expect(objectKeyFor('media', 'asset1', '', 'abc123')).toBe('media/asset1/abc123.bin');
  });
});

describe('PDF documents (change log 1.16)', () => {
  const pdf = (body = '1 0 obj << /Type /Page >> endobj') => `%PDF-1.4\n${body}\ntrailer << >>\n%%EOF\n`;
  const doc = (text: string, over: Partial<{ detectedMime: string | null; bytes: number }> = {}) => ({ detectedMime: 'application/pdf', bytes: text.length, text, ...over });

  it('accepts an ordinary PDF and knows its kind and limit', () => {
    expect(documentRejectionReason(doc(pdf()), 'application/pdf')).toBeNull();
    expect(mediaKindForMime('application/pdf')).toBe('document');
    expect(mediaKindForMime('image/png')).toBe('image');
    expect(mediaKindForMime('application/zip')).toBeNull();
    expect(maxBytesFor('document')).toBe(20 * 1024 * 1024);
    expect(maxBytesFor('image')).toBe(10 * 1024 * 1024);
  });

  it('refuses what is not a plain, complete PDF', () => {
    expect(documentRejectionReason(doc(pdf(), { bytes: 0 }), 'application/pdf')).toMatch(/empty/);
    expect(documentRejectionReason(doc(pdf(), { bytes: 21 * 1024 * 1024 }), 'application/pdf')).toMatch(/20 MB/);
    expect(documentRejectionReason(doc('PK zip archive', { detectedMime: 'application/zip' }), 'application/pdf')).toMatch(/Only PDF/);
    expect(documentRejectionReason(doc('%PDF-1.4\n1 0 obj'), 'application/pdf')).toMatch(/incomplete/);
    expect(documentRejectionReason(doc(pdf('<< /Encrypt 5 0 R >>')), 'application/pdf')).toMatch(/encrypted/);
  });

  it('refuses scripts, launch actions, attachments, rich media and XML forms', () => {
    expect(documentRejectionReason(doc(pdf('<< /S /JavaScript /JS (app.alert(1)) >>')), 'application/pdf')).toMatch(/scripts/);
    expect(documentRejectionReason(doc(pdf('<< /S /Launch /F (cmd.exe) >>')), 'application/pdf')).toMatch(/other programs/);
    expect(documentRejectionReason(doc(pdf('<< /EmbeddedFiles 7 0 R >>')), 'application/pdf')).toMatch(/files attached/);
    expect(documentRejectionReason(doc(pdf('<< /RichMedia 8 0 R >>')), 'application/pdf')).toMatch(/embedded media/);
    expect(documentRejectionReason(doc(pdf('<< /XFA 9 0 R >>')), 'application/pdf')).toMatch(/XML form/);
    // The word in ordinary text is not a PDF name, so it is not refused.
    expect(documentRejectionReason(doc(pdf('(Learn JavaScript in Adelaide) Tj')), 'application/pdf')).toBeNull();
  });

  it('counts pages and makes a safe download name', () => {
    expect(pdfPageCount(pdf('1 0 obj << /Type /Page >> 2 0 obj << /Type /Page >> 3 0 obj << /Type /Pages >>'))).toBe(2);
    expect(pdfPageCount('%PDF-1.4')).toBeNull();
    expect(safeDownloadName('Price list 2026 (final).pdf')).toBe('Price-list-2026-final.pdf');
    expect(safeDownloadName('"; rm -rf /.pdf')).toBe('rm-rf.pdf');
    expect(safeDownloadName('.pdf')).toBe('document.pdf');
    expect(readableFileSize(1_258_291)).toBe('1.2 MB');
  });
});
