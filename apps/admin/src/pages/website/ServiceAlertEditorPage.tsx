import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Switch, Typography } from 'antd';
import { ALERT_SEVERITIES, alertPresentation } from '@adelaide-sphere/domain/alerts';
import { useNavigate, useParams } from 'react-router';
import { adelaideLocalToUtc, adelaideOffsetLabel, utcToAdelaideLocal } from '@/api/blog';
import { serviceAlertsApi, type AlertSeverity, type ServiceAlert } from '@/api/website';
import { RecordEditorPage, SectionCard } from '@/components/ui';
import { ServiceAlertPreview } from './ServiceAlertPreview';
import { alertVisibility } from './alert-preview-model';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { FormSelect } from '@/components/FormSelect';

interface Values {
  title: string;
  message: string;
  severity: AlertSeverity;
  /** `YYYY-MM-DDTHH:mm` as typed, in Adelaide time; converted once, on save. */
  startsLocal: string;
  endsLocal: string;
  linkLabel: string;
  linkUrl: string;
  dismissible: boolean;
  priority: number;
  displayOrder: number;
}

const LIST = '/website/service-alerts';

/** Create or edit one alert on its own page (SRS 1.2 ALRT 007). */
export function ServiceAlertEditorPage() {
  const { id } = useParams();
  const creating = id === undefined || id === 'new';
  useDocumentTitle(creating ? 'New alert' : 'Edit alert');
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const { saving, error, setError, submit } = useRecordEditor<Values>(form);
  // Watched so the preview follows what is being typed rather than what was
  // last saved; the preview is the reason the fields are worth filling in.
  const draft = Form.useWatch([], form) as Partial<Values> | undefined;
  // The offset of the date being scheduled, not of today: Adelaide is ACDT for
  // half the year, and a label that says ACST beside a February date is wrong by
  // an hour at exactly the moment it matters.
  const offsetLabel = adelaideOffsetLabel(adelaideLocalToUtc(draft?.startsLocal ?? '') ?? new Date());
  const endOffsetLabel = adelaideOffsetLabel(adelaideLocalToUtc(draft?.endsLocal ?? '') ?? adelaideLocalToUtc(draft?.startsLocal ?? '') ?? new Date());

  const [state] = useAsync<ServiceAlert | null>(
    () => (creating ? Promise.resolve(null) : serviceAlertsApi.get(id!)),
    [id, creating],
  );
  const record = state.status === 'ready' ? state.data : null;

  useEffect(() => {
    if (!record) return;
    form.setFieldsValue({
      title: record.title,
      message: record.message,
      severity: record.severity,
      linkLabel: record.linkLabel ?? '',
      linkUrl: record.linkUrl ?? '',
      dismissible: record.dismissible,
      priority: record.priority,
      displayOrder: record.displayOrder,
      startsLocal: record.startsAt ? utcToAdelaideLocal(new Date(record.startsAt)) : '',
      endsLocal: record.endsAt ? utcToAdelaideLocal(new Date(record.endsAt)) : '',
    });
  }, [record, form]);

  /** What the preview draws: the values being typed, resolved to instants. */
  const previewAlert = {
    title: draft?.title ?? '',
    message: draft?.message ?? '',
    severity: (draft?.severity ?? 'informational') as AlertSeverity,
    linkLabel: draft?.linkLabel ?? '',
    linkUrl: draft?.linkUrl ?? '',
    dismissible: draft?.dismissible ?? true,
    startsAt: adelaideLocalToUtc(draft?.startsLocal ?? '')?.toISOString() ?? null,
    endsAt: adelaideLocalToUtc(draft?.endsLocal ?? '')?.toISOString() ?? null,
    status: record?.status === 'published' ? ('published' as const) : ('draft' as const),
  };

  const save = () =>
    submit(async (values) => {
      // Adelaide time in, an instant out — converted once, here. Reading the
      // picker's value as browser-local time scheduled an alert at the wrong
      // hour for anyone editing from outside South Australia (SRS 1.2 ALRT 003).
      const startsAt = values.startsLocal ? adelaideLocalToUtc(values.startsLocal) : null;
      if (values.startsLocal && !startsAt) {
        setError('Enter a valid start date and time, or leave it empty');
        throw new Error('invalid-start');
      }
      const endsAt = values.endsLocal ? adelaideLocalToUtc(values.endsLocal) : null;
      if (values.endsLocal && !endsAt) {
        setError('Enter a valid end date and time, or leave it empty');
        throw new Error('invalid-end');
      }
      if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
        setError('The alert must stop after it starts');
        throw new Error('invalid-window');
      }
      const payload = {
        title: values.title,
        message: values.message,
        severity: values.severity,
        linkLabel: values.linkLabel?.trim() || null,
        linkUrl: values.linkUrl?.trim() || null,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
        dismissible: values.dismissible,
        priority: values.priority,
        displayOrder: values.displayOrder,
      };
      if (creating) await serviceAlertsApi.create(payload);
      else if (!record) throw new Error('This alert could not be loaded, so nothing was saved. Reload the page and try again.');
      else await serviceAlertsApi.update(record.id, { ...payload, expectedVersion: record.version });
      message.success(creating ? 'Alert created as a draft' : 'Alert updated');
    }).then((ok) => {
      if (ok) navigate(LIST);
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Website' }, { label: 'Service alerts', href: LIST }, { label: creating ? 'New alert' : 'Edit' }]}
      title={creating ? 'New service alert' : 'Edit service alert'}
      description="Shown above every public page while published and in its window. Adelaide time."
      listHref={LIST}
      listLabel="Back to alerts"
      form={form}
      initialValues={{ title: '', message: '', severity: 'informational', startsLocal: '', endsLocal: '', linkLabel: '', linkUrl: '', dismissible: true, priority: 0, displayOrder: 0 }}
      loading={state.status === 'loading'}
      saving={saving}
      error={error ?? (state.status === 'error' ? state.message : null)}
      status={record ? `Version ${record.version} · last edited ${formatDateTime(record.updatedAt)}` : 'Not saved yet'}
      onSubmit={save}
      submitLabel={creating ? 'Create alert' : 'Save changes'}
      aside={
        <div>
          {/* This column is about as wide as a phone, so the phone-width preview
              sits here beside the fields it follows; the wide-screen one is under
              the form, where there is room for it to be honest. */}
          <SectionCard title="On a phone" description="The same colours the public site uses, drawn from the one table both applications read.">
            <ServiceAlertPreview alert={previewAlert} width={320} />
            <Typography.Paragraph type="secondary" style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5 }}>
              This is a picture of the banner, not the banner: it is hidden from screen readers so it cannot announce itself while you type.
            </Typography.Paragraph>
          </SectionCard>
          <SectionCard title="Status" description="Publishing is done from the list, so it is always a deliberate step.">
            <Typography.Paragraph style={{ marginBottom: 8 }}>{alertVisibility(previewAlert, new Date())}</Typography.Paragraph>
            <Typography.Text type="secondary">
              Editing the wording or severity brings this alert back for anyone who dismissed the earlier version.
            </Typography.Text>
          </SectionCard>
        </div>
      }
    >
      <Form.Item label="Title" name="title" rules={[{ required: true, min: 3, max: 120, message: 'Between 3 and 120 characters' }]}>
        <Input maxLength={120} showCount placeholder="e.g. Planned maintenance on Sunday morning" />
      </Form.Item>
      <Form.Item label="Message" name="message" extra="One or two sentences. It appears on every page, so keep it short." rules={[{ required: true, min: 5, max: 400, message: 'Between 5 and 400 characters' }]}>
        <Input.TextArea rows={4} maxLength={400} showCount placeholder="What visitors need to know, and what to do about it." />
      </Form.Item>
      <Form.Item label="Severity" name="severity" extra="Emergency interrupts what a screen reader is saying, so keep it for genuine outages." rules={[{ required: true }]}>
        <FormSelect placeholder="Choose a severity"
          style={{ maxWidth: 280 }}
          options={ALERT_SEVERITIES.map((severity) => ({ value: severity, label: alertPresentation(severity).label }))}
        />
      </Form.Item>
      <Form.Item label={`Starts (Adelaide time, ${offsetLabel})`} name="startsLocal" extra="Leave empty to start as soon as it is published.">
        <Input type="datetime-local" style={{ maxWidth: 280 }} />
      </Form.Item>
      <Form.Item label={`Stops (Adelaide time, ${endOffsetLabel})`} name="endsLocal" extra="Leave empty to show it until you unpublish it.">
        <Input type="datetime-local" style={{ maxWidth: 280 }} />
      </Form.Item>
      <Form.Item label="Link text" name="linkLabel" extra="Leave both link fields empty for an alert with no link.">
        <Input maxLength={60} style={{ maxWidth: 320 }} placeholder="e.g. Read the details" />
      </Form.Item>
      <Form.Item label="Link address" name="linkUrl" extra="A page on this site (starting with /) or a full https address. Checked when you save.">
        <Input maxLength={300} placeholder="/contact" />
      </Form.Item>
      <Form.Item label="Visitors can dismiss it" name="dismissible" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label="Priority" name="priority" extra="Higher shows first among alerts of the same severity.">
        <InputNumber min={0} max={100} placeholder="0" />
      </Form.Item>
      <Form.Item label="Display order" name="displayOrder">
        <InputNumber placeholder="0" min={0} max={9999} />
      </Form.Item>

      <div style={{ marginTop: 8 }}>
        <Typography.Title level={2} style={{ fontSize: 15, marginBottom: 4 }}>
          On a wide screen
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
          How the banner sits above the site’s header on a desktop.
        </Typography.Paragraph>
        <ServiceAlertPreview alert={previewAlert} />
      </div>
    </RecordEditorPage>
  );
}
