import { Form, Input, Typography } from 'antd';
import type { Post } from '@/api/blog';
import { MediaField } from '@/components/MediaField';
import { SectionCard } from '@/components/ui';

interface Props {
  post: Post | null;
  readOnly: boolean;
  /** Remounts the picker after "Discard changes", so it forgets an unsaved choice. */
  resetKey: number;
}

/**
 * The picture at the top of the article and on its card. An image can be
 * chosen from the library or uploaded here; the description is asked for first
 * because every published image needs one (MED 003) and the library stores it
 * with the upload.
 */
export function FeaturedImageBox({ post, readOnly, resetKey }: Props) {
  const description = (Form.useWatch('coverAlt') as string | null | undefined)?.trim();
  return (
    <SectionCard title="Featured image" description="Shown at the top of the article and in article lists." style={{ marginBottom: 16 }}>
      <Form.Item name="coverMediaId" style={{ marginBottom: 12 }}>
        <MediaField key={resetKey} current={post?.cover ?? null} emptyLabel="No featured image" disabled={readOnly} uploadAlt={description || undefined} />
      </Form.Item>
      {!description && !readOnly && (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginBottom: 8 }}>
          To upload a new picture, write its description below first. Or choose one already in the library.
        </Typography.Text>
      )}
      <Form.Item label="Image description" name="coverAlt" extra="What the picture shows, read aloud to people who cannot see it." style={{ marginBottom: 0 }}>
        <Input maxLength={255} placeholder="e.g. Coffee being poured at a Norwood café" />
      </Form.Item>
    </SectionCard>
  );
}
