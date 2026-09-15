import { faqPageJsonLd } from './structured-data';
import { faqRichResultsEnabled } from './site';

describe('FAQ structured data (SRS 1.2 FAQ 005)', () => {
  const faqs = [
    { question: 'How do I list my business?', answerHtml: '<p>Send us the <strong>details</strong>.</p>' },
    { question: 'Are reviews checked?', answerHtml: '<p>Yes &amp; always.</p>' },
  ];

  it('describes only the questions given, with the answer reduced to text', () => {
    const data = faqPageJsonLd(faqs) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(data.mainEntity).toHaveLength(2);
    expect(data.mainEntity[0]!.name).toBe('How do I list my business?');
    expect(data.mainEntity[0]!.acceptedAnswer.text).toBe('Send us the details.');
    // Entities are decoded rather than left as markup.
    expect(data.mainEntity[1]!.acceptedAnswer.text).toContain('Yes & always');
    expect(JSON.stringify(data)).not.toContain('<p>');
  });

  it('is gated off unless the deployment has explicitly enabled it', () => {
    const original = process.env.FAQ_RICH_RESULTS;
    try {
      delete process.env.FAQ_RICH_RESULTS;
      expect(faqRichResultsEnabled()).toBe(false);
      process.env.FAQ_RICH_RESULTS = 'false';
      expect(faqRichResultsEnabled()).toBe(false);
      process.env.FAQ_RICH_RESULTS = 'true';
      expect(faqRichResultsEnabled()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.FAQ_RICH_RESULTS;
      else process.env.FAQ_RICH_RESULTS = original;
    }
  });
});
