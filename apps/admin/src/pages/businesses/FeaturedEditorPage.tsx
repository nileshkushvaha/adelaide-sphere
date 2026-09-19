import { useState } from 'react';
import { RemoteSelect } from '@/components/RemoteSelect';
import { App, Form, Input, InputNumber, Skeleton, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { businessesApi, featuredApi } from '@/api/businesses';
import { adelaideLocalToUtc, utcToAdelaideLocal, adelaideOffsetLabel } from '@/api/blog';
import { RecordEditorPage } from '@/components/ui';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { formatDateTime } from '@/shared/format';
import { FeaturedPlacementPreview } from './FeaturedPlacementPreview';

interface Values {
  businessId: string;
  startsLocal: string;
  endsLocal?: string;
  position?: number;
  note?: string;
}

/**
 * A new featured placement on its own route (SRS DIR 007).
 *
 * A placement is created and removed, never edited: the audit trail of "this
 * listing was featured from then until then" is more useful than a record whose
 * dates were quietly moved. Times are entered in Adelaide time and converted
 * once, here, so what is stored is unambiguous.
 */
export function FeaturedEditorPage() {
  useDocumentTitle('Feature a listing');
  const api = featuredApi();
  const listings = businessesApi();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  const { saving, error, setError, submit } = useRecordEditor<Values>(form);
  // Slugs of the businesses the search has offered, for the preview card of the one chosen.
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  // The offset of the dates being entered, not of today: across a daylight-saving
  // change the two differ by an hour, and the label is what the operator trusts.
  const startsLocal = Form.useWatch('startsLocal', form) as string | undefined;
  const endsLocal = Form.useWatch('endsLocal', form) as string | undefined;
  const startOffset = adelaideOffsetLabel(adelaideLocalToUtc(startsLocal ?? '') ?? new Date());
  const endOffset = adelaideOffsetLabel(adelaideLocalToUtc(endsLocal ?? '') ?? adelaideLocalToUtc(startsLocal ?? '') ?? new Date());

  // The card the placement will put on screen, read from the public route for
  // the chosen listing. Only published listings are offered, so the public
  // route answers for every choice.
  const businessId = Form.useWatch('businessId', form) as string | undefined;
  const chosenSlug = businessId ? slugs[businessId] : undefined;
  const [card] = useAsync((signal) => (chosenSlug ? listings.publicCard(chosenSlug, signal) : Promise.resolve(null)), [chosenSlug]);
  const startsAt = adelaideLocalToUtc(startsLocal ?? '');
  const endsAt = endsLocal ? adelaideLocalToUtc(endsLocal) : null;
  const windowLabel = startsAt ? (endsAt ? `from ${formatDateTime(startsAt.toISOString())} until ${formatDateTime(endsAt.toISOString())}` : `from ${formatDateTime(startsAt.toISOString())} with no end date`) : 'once the dates are set';

  const save = () =>
    submit(async (values) => {
      // Entered in Adelaide time and converted once, here, so what reaches the
      // API is unambiguous whatever the operator's own clock says.
      const startsAt = adelaideLocalToUtc(values.startsLocal);
      if (!startsAt) {
        setError('Choose a valid start date and time');
        throw new Error('invalid-start');
      }
      const endsAt = values.endsLocal ? adelaideLocalToUtc(values.endsLocal) : null;
      if (values.endsLocal && !endsAt) {
        setError('Choose a valid end date and time');
        throw new Error('invalid-end');
      }
      await api.create({ businessId: values.businessId, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, position: values.position ?? 0, note: values.note });
      message.success('Placement created');
    }).then((ok) => {
      if (ok) navigate('/businesses/featured');
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Business', href: '/businesses' }, { label: 'Featured listings', href: '/businesses/featured' }, { label: 'Feature a listing' }]}
      title="Feature a listing"
      description="Shown in a labelled block above results. It must still match the search and be published."
      listHref="/businesses/featured"
      listLabel="All placements"
      form={form}
      initialValues={{ startsLocal: utcToAdelaideLocal(new Date()), position: 0 }}
      saving={saving}
      error={error}
      submitLabel="Create placement"
      onSubmit={save}
      aside={
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: 16 }}>
            <Typography.Text strong>How it will appear</Typography.Text>
            {!chosenSlug && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Choose a listing to see the card visitors will get.
              </Typography.Paragraph>
            )}
            {chosenSlug && card.status === 'loading' && <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 12 }} />}
            {chosenSlug && card.status === 'error' && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                The listing could not be read from the public site just now. The placement can still be created.
              </Typography.Paragraph>
            )}
            {card.status === 'ready' && card.data && (
              <div style={{ marginTop: 12 }}>
                <FeaturedPlacementPreview business={card.data} window={windowLabel} />
              </div>
            )}
          </div>
          <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: 16 }}>
            <Typography.Text strong>What this does not do</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              It never changes ranking, bypasses a filter or shows an unpublished listing. There is no payment involved.
            </Typography.Paragraph>
          </div>
        </div>
      }
    >
      <Form.Item label="Listing" name="businessId" rules={[{ required: true, message: 'Choose a published listing' }]}>
        <RemoteSelect
          placeholder="Search published listings"
          width={420}
          search={(term, signal) =>
            listings.list({ status: 'published', q: term || undefined, pageSize: 20, sort: 'name', order: 'asc' }, signal).then((result) => {
              setSlugs((current) => ({ ...current, ...Object.fromEntries(result.data.map((business) => [business.id, business.slug])) }));
              return result.data.map((business) => ({ value: business.id, label: business.name }));
            })
          }
        />
      </Form.Item>
      <Form.Item label={`Starts (Adelaide time, ${startOffset})`} name="startsLocal" rules={[{ required: true, message: 'Choose when the placement starts' }]}>
        <Input type="datetime-local" />
      </Form.Item>
      <Form.Item label={`Ends (optional, Adelaide time, ${endOffset})`} name="endsLocal" extra="Leave empty for an open-ended placement.">
        <Input type="datetime-local" />
      </Form.Item>
      <Form.Item label="Position" name="position" extra="Lower positions appear first.">
        <InputNumber placeholder="0" min={0} max={999} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item label="Editorial note" name="note" extra="Recorded in the audit log; never shown publicly." style={{ marginBottom: 0 }}>
        <Input maxLength={500} placeholder="e.g. Agreed with the owner on 3 March; runs to the end of the month." />
      </Form.Item>
    </RecordEditorPage>
  );
}
