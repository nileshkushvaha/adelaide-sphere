import { useRef, useState } from 'react';
import { Form, Input, Modal, Typography } from 'antd';
import { useOnError } from '@refinedev/core';
import { pagesApi, type StaticPage } from '@/api/settings';
import { isApiError } from '@/api/errors';
import { slugify } from '@/shared/slug';
import { errorMessage } from '@/shared/useAsync';

interface Props {
  source: StaticPage;
  onCancel: () => void;
  /** Called with the copy once it exists, to open it. */
  onDuplicated: (copy: StaticPage) => void;
}

/**
 * Copies a page into a new draft at its own address (change log 1.17), so a
 * new service page can start from one that already works. The copy is checked
 * like any new page: its address must be free, and every picture, document and
 * business it uses must still be available.
 */
export function DuplicatePageDialog({ source, onCancel, onDuplicated }: Props) {
  const { mutate: onAuthError } = useOnError();
  const [title, setTitle] = useState(`${source.title} (copy)`);
  const [slug, setSlug] = useState(slugify(`${source.slug}-copy`));
  const [errors, setErrors] = useState<{ title?: string; slug?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const lastTitle = useRef(title);

  const submit = async () => {
    const next = { title: title.trim(), slug: slug.trim().toLowerCase() };
    const found: typeof errors = {};
    if (next.title.length < 3) found.title = 'A title needs at least 3 characters.';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug) || next.slug.length < 2) found.slug = 'Use lower-case letters, numbers and single hyphens.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      onDuplicated(await pagesApi().duplicate(source.slug, next));
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else if (isApiError(error) && (error.fields.slug || error.fields.title)) setErrors({ slug: error.fields.slug?.[0], title: error.fields.title?.[0] });
      else {
        const sectionProblem = isApiError(error) ? Object.entries(error.fields).find(([key]) => key.startsWith('sections'))?.[1]?.[0] : undefined;
        setErrors({ form: sectionProblem ? `The page uses something that is no longer available: ${sectionProblem}` : errorMessage(error) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Duplicate “${source.title}”`} okText="Create copy" okButtonProps={{ loading: saving }} onOk={() => void submit()} onCancel={onCancel} destroyOnHidden>
      <Typography.Paragraph>The copy is a draft with the same sections, layout and search settings. Nothing about the original changes.</Typography.Paragraph>
      <Form layout="vertical" component={false}>
        <Form.Item label="Title of the copy" htmlFor="duplicate-page-title" validateStatus={errors.title ? 'error' : undefined} help={errors.title}>
          <Input
            id="duplicate-page-title"
            value={title}
            maxLength={180}
            autoFocus
            onChange={(event) => {
              const nextTitle = event.target.value;
              // The address follows the title while it still matches it.
              if (slug === slugify(lastTitle.current) || slug === slugify(`${source.slug}-copy`)) setSlug(slugify(nextTitle));
              lastTitle.current = nextTitle;
              setTitle(nextTitle);
            }}
          />
        </Form.Item>
        <Form.Item label="Address of the copy" htmlFor="duplicate-page-slug" validateStatus={errors.slug ? 'error' : undefined} help={errors.slug ?? 'Lower-case letters, numbers and single hyphens.'}>
          <Input id="duplicate-page-slug" addonBefore="/" value={slug} maxLength={64} onChange={(event) => setSlug(event.target.value)} />
        </Form.Item>
      </Form>
      {errors.form && <Typography.Paragraph type="danger">{errors.form}</Typography.Paragraph>}
    </Modal>
  );
}
