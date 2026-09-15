import { Typography } from 'antd';
import type { PublicBusinessCard } from '@/api/businesses';
import { brand } from '@/config/theme';

/**
 * The featured block as the public results page draws it (SRS DIR 007): a
 * tinted panel headed "Featured" holding the listing's card with its own
 * "Featured" label. Built from the listing as the public site returns it, so
 * the image, category and area are the ones visitors will see, not a guess
 * from the admin record.
 *
 * A listing without a photograph gets the site's branded fallback — initials
 * on a coloured panel — rather than a grey box, because that is what the site
 * does and an editor deciding whether to feature it should see that.
 *
 * `aria-hidden`: it repeats the listing chosen in the field above, and it is a
 * picture of a card, not a card — nothing in it can be followed.
 */
export function FeaturedPlacementPreview({ business, window }: { business: PublicBusinessCard; window: string }) {
  const initials = business.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');

  return (
    <div>
      <div aria-hidden="true" style={{ borderRadius: 14, border: `1px solid ${brand.border}`, background: '#F3F6FC', padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>Featured</div>
        <div style={{ borderRadius: 14, overflow: 'hidden', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden' }}>
            {business.image ? (
              <img src={business.image.url} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.92)', background: 'linear-gradient(135deg, #0B3AA4, #012169)', fontSize: 30, letterSpacing: '0.04em', fontWeight: 600 }}>{initials}</div>
            )}
            <span style={{ position: 'absolute', left: 12, top: 12, borderRadius: 999, background: 'rgba(255,255,255,0.95)', color: '#012169', fontSize: 12, fontWeight: 600, padding: '4px 12px', boxShadow: '0 1px 2px rgba(15,23,42,0.1)' }}>Featured</span>
          </div>
          <div style={{ padding: '16px 18px', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span style={{ borderRadius: 999, background: '#F3F6FC', color: '#0B3AA4', fontWeight: 600, padding: '4px 10px' }}>{business.primaryCategory.name}</span>
              <span style={{ color: '#475569' }}>{business.localArea.name}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: '#0F172A' }}>{business.name}</div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {business.rating ? `${business.rating.average.toFixed(1)} · ${business.rating.count} review${business.rating.count === 1 ? '' : 's'}` : 'No reviews yet'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${brand.border}`, padding: '10px 18px', fontSize: 13 }}>
            <span style={{ color: '#0B3AA4', fontWeight: 600 }}>View details</span>
            <span style={{ color: '#475569' }}>Contact</span>
          </div>
        </div>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
        Shown above results that this listing already matches, {window}. It looks the same as any other card apart from the label.
      </Typography.Paragraph>
    </div>
  );
}
