import { App, Form, Input, Radio } from 'antd';
import { useNavigate } from 'react-router';
import { REDIRECT_KIND_LABELS, seoApi, type RedirectKind } from '@/api/seo';
import { RecordEditorPage } from '@/components/ui';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

interface Values {
  sourcePath: string;
  targetPath?: string;
  kind: RedirectKind;
  reason?: string;
}

/**
 * A new redirect rule on its own route (SRS SEO 004).
 *
 * There is no edit route: a redirect is not amended, it is deleted and
 * replaced, because a rule that quietly changes destination is harder to
 * account for than one that was removed and a new one created.
 */
export function RedirectEditorPage() {
  useDocumentTitle('New redirect');
  const api = seoApi();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  const kind = Form.useWatch('kind', form) ?? 'permanent';
  const { saving, error, submit } = useRecordEditor<Values>(form);

  const save = () =>
    submit(async (values) => {
      // A "gone" rule has no destination by definition; the API validates the
      // paths again and refuses anything that would leave this site.
      await api.create({ sourcePath: values.sourcePath, targetPath: values.kind === 'gone' ? null : values.targetPath, kind: values.kind, reason: values.reason });
      message.success('Redirect saved');
    }).then((ok) => {
      if (ok) navigate('/redirects');
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Configuration' }, { label: 'SEO redirects', href: '/redirects' }, { label: 'New redirect' }]}
      title="New redirect"
      description="Redirect an old address, or mark it as removed. Slug changes create these automatically."
      listHref="/redirects"
      listLabel="All redirects"
      form={form}
      initialValues={{ kind: 'permanent' as RedirectKind }}
      saving={saving}
      error={error}
      submitLabel="Save redirect"
      onSubmit={save}
    >
      <Form.Item
        label="Type"
        name="kind"
        extra={
          kind === 'temporary'
            ? 'A temporary move is not remembered by browsers or search engines, so it can be undone later without a trace.'
            : kind === 'gone'
              ? 'Tells visitors and search engines the page is gone for good, so it is dropped from search results.'
              : 'Search engines move their record of the page to the new address.'
        }
      >
        <Radio.Group
          options={(Object.keys(REDIRECT_KIND_LABELS) as RedirectKind[]).map((value) => ({ value, label: REDIRECT_KIND_LABELS[value] }))}
          optionType="button"
        />
      </Form.Item>
      <Form.Item label="Old address" name="sourcePath" rules={[{ required: true, message: 'Enter the old path' }]} extra="Site-relative, for example /business/old-name">
        <Input placeholder="/business/old-name" />
      </Form.Item>
      {/* A removed page has nowhere to send anyone; the other two both do. */}
      {kind !== 'gone' && (
        <Form.Item label="New address" name="targetPath" rules={[{ required: true, message: 'Enter the new path' }]} extra="Must be a path on this site.">
          <Input placeholder="/business/new-name" />
        </Form.Item>
      )}
      <Form.Item label="Reason" name="reason" extra="Recorded with the redirect and in the activity log." style={{ marginBottom: 0 }}>
        <Input maxLength={500} placeholder="e.g. The business changed its trading name" />
      </Form.Item>
    </RecordEditorPage>
  );
}
