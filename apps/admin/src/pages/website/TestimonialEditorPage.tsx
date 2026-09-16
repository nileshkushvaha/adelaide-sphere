import { useEffect } from 'react';
import { businessesApi } from '@/api/businesses';
import { RemoteSelect } from '@/components/RemoteSelect';
import { App, Form, Input, InputNumber } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { testimonialsApi, type Testimonial } from '@/api/website';
import { RecordEditorPage } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { MediaField } from '@/components/MediaField';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

interface Values {
  displayName: string;
  relationship: string;
  quote: string;
  rating?: number | null;
  businessId: string;
  mediaId: string;
  displayOrder: number;
}

const LIST = '/website/testimonials';

/** Create or edit one testimonial on its own page (SRS 1.2 TSTM 005). */
export function TestimonialEditorPage() {
  const { id } = useParams();
  const creating = id === undefined || id === 'new';
  useDocumentTitle(creating ? 'New testimonial' : 'Edit testimonial');
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);

  const [state] = useAsync<Testimonial | null>(
    () => (creating ? Promise.resolve(null) : testimonialsApi.get(id!)),
    [id, creating],
  );
  const record = state.status === 'ready' ? state.data : null;
  const linkedBusinessId = Form.useWatch('businessId', form) as string | undefined;
  const [linkedBusiness] = useAsync((signal) => (linkedBusinessId ? businessesApi().get(linkedBusinessId, signal) : Promise.resolve(null)), [linkedBusinessId]);

  useEffect(() => {
    if (!record) return;
    form.setFieldsValue({
      displayName: record.displayName,
      relationship: record.relationship ?? '',
      quote: record.quote,
      rating: record.rating,
      businessId: record.businessId ?? '',
      mediaId: record.mediaId ?? '',
      displayOrder: record.displayOrder,
    });
  }, [record, form]);

  const persist = (values: Values) =>
    submit(async () => {
      const payload = {
        displayName: values.displayName,
        relationship: values.relationship?.trim() || null,
        quote: values.quote,
        // Left empty means the person gave no rating, which is not the same as
        // giving a low one: the page then shows no stars at all.
        rating: values.rating ?? null,
        businessId: values.businessId?.trim() || null,
        mediaId: values.mediaId?.trim() || null,
        displayOrder: values.displayOrder,
      };
      if (creating) await testimonialsApi.create(payload);
      else if (!record) throw new Error('This testimonial could not be loaded, so nothing was saved. Reload the page and try again.');
      else await testimonialsApi.update(record.id, { ...payload, expectedVersion: record.version });
      message.success(creating ? 'Testimonial created as a draft' : 'Testimonial updated');
    }).then((ok) => {
      if (ok) navigate(LIST);
    });

  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    await persist(values);
  };

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Website' }, { label: 'Testimonials', href: LIST }, { label: creating ? 'New testimonial' : 'Edit' }]}
      title={creating ? 'New testimonial' : 'Edit testimonial'}
      description="Quotes shown on the public home page."
      listHref={LIST}
      listLabel="Back to testimonials"
      form={form}
      initialValues={{ displayName: '', relationship: '', quote: '', rating: null, businessId: '', mediaId: '', displayOrder: 0 }}
      loading={state.status === 'loading'}
      saving={saving}
      error={error ?? (state.status === 'error' ? state.message : null)}
      status={record ? `Version ${record.version} · last edited ${formatDateTime(record.updatedAt)}` : 'Not saved yet'}
      onSubmit={save}
      submitLabel={creating ? 'Create testimonial' : 'Save changes'}
    >
      <Form.Item label="Name" name="displayName" extra="How the person is credited publicly." rules={[{ required: true, min: 2, max: 120, message: 'Between 2 and 120 characters' }]}>
        <Input maxLength={120} style={{ maxWidth: 420 }} placeholder="e.g. Sarah Nguyen" />
      </Form.Item>
      <Form.Item label="Role or relationship" name="relationship" extra="How the person is described under their name.">
        <Input maxLength={160} style={{ maxWidth: 420 }} placeholder="e.g. Owner, Norwood Corner Bakery" />
      </Form.Item>
      <Form.Item
        label="Quote"
        name="quote"
        extra="Plain text, in the person’s own words. Formatting is removed when you save."
        rules={[{ required: true, min: 20, max: 1000, message: 'Between 20 and 1000 characters' }]}
      >
        <Input.TextArea rows={7} maxLength={1000} showCount placeholder="What they said, in their own words." />
      </Form.Item>
      <Form.Item label="Rating" name="rating" extra="Stars the person gave, 1 to 5. Empty shows no stars at all.">
        <InputNumber min={1} max={5} precision={0} style={{ width: 120 }} placeholder="e.g. 5" />
      </Form.Item>
      <Form.Item label="Linked listing" name="businessId" extra="Optional. The quote links to this listing.">
        <RemoteSelect
          placeholder="Search for a listing"
          width={420}
          valueLabel={linkedBusiness.status === 'ready' ? linkedBusiness.data?.name : undefined}
          search={(term, signal) => businessesApi().list({ q: term || undefined, pageSize: 20, sort: 'name', order: 'asc' }, signal).then((result) => result.data.map((business) => ({ value: business.id, label: business.name })))}
        />
      </Form.Item>
      <Form.Item label="Portrait image" name="mediaId" extra="Chosen from the media library. Optional.">
        <MediaField current={record?.image ?? null} emptyLabel="No portrait yet" clearLabel="Remove portrait" aspectRatio="1 / 1" />
      </Form.Item>
      <Form.Item label="Display order" name="displayOrder">
        <InputNumber min={0} max={9999} placeholder="0" />
      </Form.Item>
    </RecordEditorPage>
  );
}
