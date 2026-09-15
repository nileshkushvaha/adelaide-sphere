import { useState } from 'react';
import { Alert, Button, Input, Space, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { seoApi, type RedirectPreview } from '@/api/seo';
import { SectionCard } from '@/components/ui';
import { brand } from '@/config/theme';
import { errorMessage } from '@/shared/useAsync';

/** What each outcome means, for the person who typed the path. */
const OUTCOMES: Record<RedirectPreview['outcome'], string> = {
  applies: '',
  'no-rule': 'Nothing is set up for this address, so the site shows the page itself — or its own “page not found” if there is no page there.',
  inactive: 'A rule exists for this address but is switched off, so visitors are treated as though it were not there. It still occupies the address, so a new rule for it would replace this one.',
  'no-target': 'A rule exists but has no destination, so nothing can be sent anywhere. Delete it or set a destination.',
  'invalid-path': 'That is not an address on this site. Enter a path such as /business/old-name.',
};

/**
 * Answers "what happens if someone opens this address?" from the server rather
 * than from anything this screen works out for itself — the same function the
 * public resolver uses decides it, so the preview cannot disagree with what
 * visitors actually get.
 */
export function RedirectPreviewPanel({ initialPath = '' }: { initialPath?: string }) {
  const api = seoApi();
  const [path, setPath] = useState(initialPath);
  const [result, setResult] = useState<RedirectPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    const value = path.trim();
    if (!value) return;
    setChecking(true);
    setError(null);
    try {
      setResult(await api.preview(value));
    } catch (thrown) {
      setError(errorMessage(thrown));
      setResult(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SectionCard
      title="Test an address"
      description="What the site does with an address right now, ignoring caches."
    >
      <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
        <Input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onPressEnter={() => void check()}
          placeholder="/business/old-name"
          aria-label="Address to test"
          maxLength={255}
        />
        {/* An explicit name: Ant's loading indicator contributes text to the
            button's accessible name, so without this the control is announced
            as "loading Test" while it works. */}
        <Button aria-label="Test this address" onClick={() => void check()} loading={checking} disabled={path.trim() === ''}>
          Test
        </Button>
      </Space.Compact>

      {error && <Alert type="error" showIcon role="alert" message={error} style={{ marginTop: 12 }} />}

      {result && (
        <div style={{ marginTop: 16 }} aria-live="polite">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              background: brand.surfaceMuted,
            }}
          >
            <Typography.Text style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}>{result.normalisedPath ?? result.requestedPath}</Typography.Text>
            <ArrowRightOutlined aria-hidden="true" style={{ color: brand.textSubtle }} />
            <Typography.Text strong>{result.status ?? 'no redirect'}</Typography.Text>
            {result.targetPath && (
              <>
                <ArrowRightOutlined aria-hidden="true" style={{ color: brand.textSubtle }} />
                <Typography.Text style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}>{result.targetPath}</Typography.Text>
              </>
            )}
          </div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            {result.outcome === 'applies'
              ? result.status === 410
                ? 'Visitors are told the page has been removed for good. Search engines drop it from their results.'
                : result.status === 302
                  ? 'Visitors are sent to the new address for now. Browsers and search engines do not remember it, so the move can be undone.'
                  : 'Visitors are sent to the new address, and search engines move their record of the page with it.'
              : OUTCOMES[result.outcome]}
          </Typography.Paragraph>
        </div>
      )}
    </SectionCard>
  );
}
