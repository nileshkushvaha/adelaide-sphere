import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './plain-text.js';

describe('htmlToPlainText', () => {
  it('keeps words apart across blocks and together across inline markup', () => {
    expect(htmlToPlainText('<h2>Norwood</h2><p>Coff<em>ee</em> &amp; cake</p><ul><li>Burnside</li><li>Unley</li></ul>')).toBe('Norwood Coffee & cake Burnside Unley');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(htmlToPlainText('<p>O&#39;Neil&nbsp;&lt;3 &#x2014; caf&eacute;</p>')).toBe("O'Neil <3 — caf&eacute;");
    expect(htmlToPlainText('')).toBe('');
  });
});
