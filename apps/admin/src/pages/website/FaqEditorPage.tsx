import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { faqsApi, type Faq } from '@/api/website';
import { RecordEditorPage, SectionCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

interface Values {
  question: string;
  answer: string;
  groupName: string;
  displayOrder: number;
}

const LIST = '/website/faqs';

/** Create or edit one question on its own page (SRS 1.2 FAQ 002). */
export function FaqEditorPage() {
  const { id } = useParams();
  const creating = id === undefined || id === 'new';
  useDocumentTitle(creating ? 'New question' : 'Edit question');
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);

  const [state] = useAsync<Faq | null>(() => (creating ? Promise.resolve(null) : faqsApi.get(id!)), [id, creating]);

  useEffect(() => {
    if (state.status === 'ready' && state.data) {
      form.setFieldsValue({
        question: state.data.question,
        answer: state.data.answerSource,
        groupName: state.data.groupName ?? '',
        displayOrder: state.data.displayOrder,
      });
    }
  }, [state, form]);

  const record = state.status === 'ready' ? state.data : null;

  const save = () =>
    submit(async (values) => {
      const payload = { ...values, groupName: values.groupName?.trim() || null, answerFormat: 'html' as const };
      if (creating) await faqsApi.create(payload);
      else if (!record) throw new Error('This question could not be loaded, so nothing was saved. Reload the page and try again.');
      else await faqsApi.update(record.id, { ...payload, expectedVersion: record.version });
      message.success(creating ? 'Question created as a draft' : 'Question updated');
    }).then((ok) => {
      if (ok) navigate(LIST);
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Website' }, { label: 'FAQs', href: LIST }, { label: creating ? 'New question' : 'Edit' }]}
      title={creating ? 'New question' : 'Edit question'}
      description="Shown on the public FAQ page once published."
      listHref={LIST}
      listLabel="Back to FAQs"
      form={form}
      initialValues={{ question: '', answer: '', groupName: '', displayOrder: 0 }}
      loading={state.status === 'loading'}
      saving={saving}
      error={error ?? (state.status === 'error' ? state.message : null)}
      status={record ? `Version ${record.version} · last edited ${formatDateTime(record.updatedAt)}` : 'Not saved yet'}
      onSubmit={save}
      submitLabel={creating ? 'Create question' : 'Save changes'}
      aside={
        record ? (
          <SectionCard title="Status" description="Publishing is done from the list, so it is always a deliberate step.">
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              {record.status === 'published' ? 'Published and visible to the public.' : 'Draft — not visible to the public.'}
            </Typography.Paragraph>
            <Typography.Text type="secondary">{record.publishedAt ? `First published ${formatDateTime(record.publishedAt)}` : 'Never published'}</Typography.Text>
          </SectionCard>
        ) : undefined
      }
    >
      <Form.Item label="Question" name="question" rules={[{ required: true, min: 5, max: 300, message: 'Between 5 and 300 characters' }]}>
        <Input maxLength={300} showCount placeholder="e.g. How do I add my business to the directory?" />
      </Form.Item>
      <Form.Item
        label="Answer"
        name="answer"
        extra="Basic formatting is kept; anything unsafe is removed on save."
        rules={[{ required: true, min: 5, max: 8000, message: 'Between 5 and 8000 characters' }]}
      >
        <Input.TextArea rows={12} maxLength={8000} showCount placeholder="Answer the question directly in the first sentence, then add any detail." />
      </Form.Item>
      <Form.Item label="Group" name="groupName" extra="Questions in the same group appear together. Leave empty for none.">
        <Input maxLength={80} placeholder="e.g. Listing a business" />
      </Form.Item>
      <Form.Item label="Display order" name="displayOrder" extra="Lower numbers appear first.">
        <InputNumber min={0} max={9999} placeholder="0" />
      </Form.Item>
    </RecordEditorPage>
  );
}
