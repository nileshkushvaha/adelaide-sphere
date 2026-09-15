import { describe, expect, it } from 'vitest';
import { DEFAULT_ADELAIDE_MAP_SRC, isMapEmbedSrc, isRecordId, isSiteMapSrc, isYoutubeId, parseEmbedUrl } from './embeds.js';

const PB = '!1m18!1m12!1m3!1d3151.8!2d144.96!3d-37.81!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6ad642b%3A0x5045675218ce6e0!2sFlinders%20Street!5e0!3m2!1sen!2sau!4v1700000000000';

describe('parseEmbedUrl', () => {
  it('reads every usual form of a YouTube address', () => {
    for (const address of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ']) {
      expect(parseEmbedUrl(address), address).toEqual({ ok: true, embed: { provider: 'youtube', id: 'dQw4w9WgXcQ' } });
    }
  });

  it('takes the address out of Google Maps embed HTML, and accepts the address itself', () => {
    const html = `<iframe src="https://www.google.com/maps/embed?pb=${PB}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>`;
    expect(parseEmbedUrl(html)).toEqual({ ok: true, embed: { provider: 'map', src: `https://www.google.com/maps/embed?pb=${PB}` } });
    expect(parseEmbedUrl(`https://www.google.com/maps/embed?pb=${PB}`).ok).toBe(true);
  });

  it('explains what to paste instead of a share link, a playlist or anything else', () => {
    expect(parseEmbedUrl('https://maps.app.goo.gl/abc123')).toMatchObject({ ok: false, reason: expect.stringMatching(/Embed a map/) });
    expect(parseEmbedUrl('https://www.google.com/maps/place/Flinders+St')).toMatchObject({ ok: false });
    expect(parseEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toMatchObject({ ok: false, reason: expect.stringMatching(/single video/) });
    expect(parseEmbedUrl('https://vimeo.com/123')).toMatchObject({ ok: false, reason: expect.stringMatching(/Only YouTube/) });
  });

  it('refuses look-alike hosts, scripts, credentials and malformed tokens', () => {
    for (const bad of [
      'javascript:alert(1)',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil.example/?next=youtu.be/dQw4w9WgXcQ',
      'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
      'https://www.google.com/maps/embed?pb=<script>',
      `https://www.google.com/maps/embed?pb=${'a'.repeat(2001)}`,
      '',
    ]) {
      expect(parseEmbedUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe('marker checks', () => {
  it('accepts only the exact stored shapes', () => {
    expect(isYoutubeId('dQw4w9WgXcQ')).toBe(true);
    expect(isYoutubeId('dQw4w9WgXcQ"><')).toBe(false);
    expect(isMapEmbedSrc(`https://www.google.com/maps/embed?pb=${PB}`)).toBe(true);
    expect(isMapEmbedSrc(`https://evil.example/maps/embed?pb=${PB}`)).toBe(false);
    expect(isRecordId('cmf0abcdefghijklmnopqrstu')).toBe(true);
    expect(isRecordId('../../etc')).toBe(false);
  });
});

describe('isSiteMapSrc', () => {
  it('accepts the built-in Adelaide map and validated Google embeds only', () => {
    expect(isSiteMapSrc(DEFAULT_ADELAIDE_MAP_SRC)).toBe(true);
    expect(isSiteMapSrc(`https://www.google.com/maps/embed?pb=${PB}`)).toBe(true);
    expect(isSiteMapSrc('https://www.google.com/maps?q=Sydney&output=embed')).toBe(false);
    expect(isSiteMapSrc('https://evil.example/maps/embed?pb=1')).toBe(false);
    expect(isSiteMapSrc(null)).toBe(false);
  });
});
