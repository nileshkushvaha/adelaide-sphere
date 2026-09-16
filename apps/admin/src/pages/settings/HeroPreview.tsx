import { useState } from 'react';
import { Segmented, Typography } from 'antd';
import { brand } from '@/config/theme';

export interface HeroPreviewSlide {
  url: string;
  alt: string;
  focalX?: number;
  focalY?: number;
}

interface Props {
  headline: string;
  phrases: string[];
  slides: HeroPreviewSlide[];
  countersEnabled: boolean;
}

/** The navy the public hero paints under every photograph (SRS HERO 001). */
const NAVY = 'radial-gradient(120% 120% at 10% -10%, #0b3aa4 0%, #012169 45%, #000f36 100%)';
const WASH = 'linear-gradient(90deg, rgba(1,26,85,0.96) 0%, rgba(1,26,85,0.88) 30%, rgba(1,26,85,0.58) 55%, rgba(1,26,85,0.18) 82%, rgba(1,26,85,0.08) 100%)';
const WASH_NARROW = 'rgba(1,26,85,0.80)';

/**
 * A likeness of the public home-page hero, drawn inside the admin.
 *
 * It answers the questions an editor has while writing: does the headline fit
 * on a phone, does the longest phrase wrap, is the face still in frame once the
 * photograph is cropped to a wide banner, does the counters row crowd the
 * search panel. It is a likeness, not the page — the site's typeface, its
 * slide cross-fade and its phrase rotation are not reproduced, and the copy
 * says so — because a preview that quietly differed from the site would be
 * worse than none.
 *
 * Nothing rotates here. The phrases are stepped by hand, and the picture is
 * whichever slide the editor chooses, so the preview never moves under the
 * cursor and never carries a live region into a form (WCAG 2.2.2).
 *
 * It is `aria-hidden`: everything it shows is already in the fields beside it,
 * and a screen reader would otherwise hear the headline twice.
 */
export function HeroPreview({ headline, phrases, slides, countersEnabled }: Props) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const phrase = phrases[Math.min(phraseIndex, Math.max(0, phrases.length - 1))] ?? '';
  const slide = slides[Math.min(slideIndex, Math.max(0, slides.length - 1))];
  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a), '');

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        {phrases.length > 1 && (
          <Segmented size="small" value={String(Math.min(phraseIndex, phrases.length - 1))} onChange={(value) => setPhraseIndex(Number(value))} options={phrases.map((_, index) => ({ value: String(index), label: `Phrase ${index + 1}` }))} />
        )}
        {slides.length > 1 && (
          <Segmented size="small" value={String(Math.min(slideIndex, slides.length - 1))} onChange={(value) => setSlideIndex(Number(value))} options={slides.map((_, index) => ({ value: String(index), label: `Image ${index + 1}` }))} />
        )}
      </div>

      <div aria-hidden="true" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }} className="as-hero-preview">
        <Frame label="Desktop" width="100%" height={300} narrow={false} slide={slide} headline={headline} phrase={phrase} longest={longest} countersEnabled={countersEnabled} />
        <Frame label="Phone (320 px)" width={320} height={420} narrow slide={slide} headline={headline} phrase={phrase} longest={longest} countersEnabled={countersEnabled} />
      </div>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
        A likeness, not the page: the site's own typeface, the slow cross-fade between images and the phrase rotation are not reproduced here. On the site the
        phrases change every few seconds, the images every seven, and a visitor can pause both. Visitor counts are read live on the site.
      </Typography.Paragraph>
    </div>
  );
}

function Frame({
  label,
  width,
  height,
  narrow,
  slide,
  headline,
  phrase,
  longest,
  countersEnabled,
}: {
  label: string;
  width: number | string;
  height: number;
  narrow: boolean;
  slide?: HeroPreviewSlide;
  headline: string;
  phrase: string;
  longest: string;
  countersEnabled: boolean;
}) {
  const titleSize = narrow ? 22 : 30;
  return (
    <div style={{ width, maxWidth: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        {label}
      </Typography.Text>
      <div style={{ position: 'relative', height, overflow: 'hidden', borderRadius: 10, border: `1px solid ${brand.border}`, background: NAVY, color: '#FFFFFF', isolation: 'isolate' }}>
        {slide?.url && (
          <img
            src={slide.url}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(slide.focalX ?? 0.5) * 100}% ${(slide.focalY ?? 0.5) * 100}%`, zIndex: -2 }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: narrow ? WASH_NARROW : WASH, zIndex: -1 }} />
        <div style={{ position: 'absolute', insetInline: 0, bottom: 0, height: '50%', background: 'linear-gradient(to top, rgba(1,26,85,0.7), transparent)', zIndex: -1 }} />

        <div style={{ position: 'relative', padding: narrow ? '28px 18px' : '36px 32px', maxWidth: narrow ? '100%' : '62%', display: 'grid', gap: narrow ? 14 : 18 }}>
          <div style={{ fontSize: titleSize, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
            {headline || <span style={{ opacity: 0.5 }}>Headline</span>}
            {phrase && (
              <>
                {' '}
                <span style={{ position: 'relative', display: 'inline-grid', verticalAlign: 'bottom' }}>
                  {/* The longest phrase reserves the width, exactly as the site does, so the editor sees the space the rotation will take. */}
                  <span style={{ visibility: 'hidden', gridArea: '1 / 1', whiteSpace: 'nowrap' }}>{longest}</span>
                  <span style={{ gridArea: '1 / 1', background: 'linear-gradient(90deg, #A9C1F7, #c9d7fb)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{phrase}</span>
                </span>
              </>
            )}
          </div>

          {/* The search panel as a shape only; it takes nothing and goes nowhere. */}
          <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: 8 }}>
            <div style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 6, background: '#F1F5F9', color: '#64748B', fontSize: 13, display: 'flex', alignItems: 'center', paddingInline: 10, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              What are you looking for?
            </div>
            <div style={{ height: 34, borderRadius: 6, background: '#0B3AA4', color: '#FFFFFF', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', paddingInline: 14 }}>Search</div>
          </div>

          {countersEnabled && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: narrow ? 10 : 18, fontSize: 12.5, color: 'rgba(230,238,248,0.9)' }}>
              <span>— businesses</span>
              <span>— categories</span>
              <span>— areas</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
