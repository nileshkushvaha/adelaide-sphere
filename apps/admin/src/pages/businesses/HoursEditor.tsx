import { useEffect, useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Select, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { businessesApi, toNamePath, WEEKDAYS, type DayHours, type HoursException, type HoursRecord, type PutHoursInput } from '@/api/businesses';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { SectionCard } from '@/components/ui';
import { brand } from '@/config/theme';

const DAY_STATES = [{ value: 'closed', label: 'Closed' }, { value: 'open24', label: 'Open 24 hours' }, { value: 'intervals', label: 'Set hours' }];
const EXCEPTION_KINDS = [{ value: 'closed', label: 'Closed' }, { value: 'open24', label: 'Open 24 hours' }, { value: 'custom', label: 'Custom hours' }];
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface HoursFormValues {
  mode: 'unknown' | 'scheduled';
  weekly: Record<(typeof WEEKDAYS)[number], DayHours>;
  exceptions: HoursException[];
}

const emptyWeek = (): HoursFormValues['weekly'] => Object.fromEntries(WEEKDAYS.map((d) => [d, { state: 'closed' as const }])) as HoursFormValues['weekly'];

/** Native time inputs cannot show the API's "24:00" (end of day); it is the same instant as 00:00 on the next day. */
const forInput = (day: DayHours): DayHours => (day.state === 'intervals' ? { ...day, intervals: day.intervals?.map((i) => (i.end === '24:00' ? { ...i, end: '00:00', endNextDay: true } : i)) } : day);
const forInputWeek = (weekly: Partial<HoursFormValues['weekly']>): HoursFormValues['weekly'] => Object.fromEntries(WEEKDAYS.map((d) => [d, forInput(weekly[d] ?? { state: 'closed' })])) as HoursFormValues['weekly'];
const forInputExceptions = (exceptions: HoursException[]): HoursException[] => exceptions.map((e) => (e.kind === 'custom' ? { ...e, intervals: e.intervals?.map((i) => (i.end === '24:00' ? { ...i, end: '00:00', endNextDay: true } : i)) } : e));

/** Interval rows shared by weekdays and custom exceptions. Times are HH:MM in Australia/Adelaide; "closes next day" expresses overnight trading. */
function IntervalRows({ name, disabled }: { name: (string | number)[]; disabled: boolean }) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div>
          {fields.map((field) => (
            <Space key={field.key} align="baseline" wrap>
              <Form.Item name={[field.name, 'start']} rules={[{ required: true, message: 'Opening time' }]} style={{ marginBottom: 8 }}>
                <Input type="time" aria-label="Opens" style={{ width: 120 }} />
              </Form.Item>
              <span aria-hidden="true">to</span>
              <Form.Item name={[field.name, 'end']} rules={[{ required: true, message: 'Closing time' }]} style={{ marginBottom: 8 }}>
                <Input type="time" aria-label="Closes" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name={[field.name, 'endNextDay']} valuePropName="checked" style={{ marginBottom: 8 }}>
                <Checkbox>closes next day</Checkbox>
              </Form.Item>
              <Button type="text" icon={<DeleteOutlined aria-hidden="true" />} aria-label="Remove interval" onClick={() => remove(field.name)} disabled={disabled} />
            </Space>
          ))}
          {fields.length < 4 && (
            <Button size="small" icon={<PlusOutlined aria-hidden="true" />} onClick={() => add({ start: '09:00', end: '17:00', endNextDay: false })} disabled={disabled}>
              Add interval
            </Button>
          )}
        </div>
      )}
    </Form.List>
  );
}

/**
 * Operating hours editor (SRS BUS 004): weekly schedule with distinct closed /
 * open-24 / intervals states, overnight closing via an explicit flag, and date
 * exceptions. Saves the whole schedule with the business version; the API
 * evaluates "open now" in Australia/Adelaide and reports it here for review.
 */
export function HoursEditor({ businessId, businessVersion, readOnly, onSaved }: { businessId: string; businessVersion: number; readOnly: boolean; onSaved: () => void }) {
  const api = businessesApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const [form] = Form.useForm<HoursFormValues>();
  const mode = Form.useWatch('mode', form);
  const weekly = Form.useWatch('weekly', form);
  const exceptions = Form.useWatch('exceptions', form);
  const [state, reload] = useAsync((signal) => api.getHours(businessId, signal), [businessId, businessVersion]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const record: HoursRecord | null = state.status === 'ready' ? state.data : null;

  useEffect(() => {
    if (!record) return;
    form.setFieldsValue({ mode: record.mode, weekly: forInputWeek(record.weekly), exceptions: forInputExceptions(record.exceptions) });
  }, [record, form]);

  const submit = async (values: HoursFormValues) => {
    if (!record) return;
    setError(null);
    setSaving(true);
    try {
      const body: PutHoursInput = { expectedVersion: record.version, mode: values.mode, weekly: values.mode === 'scheduled' ? values.weekly : undefined, exceptions: values.mode === 'scheduled' ? (values.exceptions ?? []).map((e) => ({ ...e, note: e.note || null })) : [] };
      await api.putHours(businessId, body);
      message.success('Hours saved');
      onSaved(); // the business version changes, which reloads this editor with the stored schedule
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else if (isApiError(err) && err.code === 'STALE_VERSION') setError('This listing was changed by someone else. Reload to see the latest version before saving again.');
      else {
        const errors = fieldErrors(err);
        form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
        setError(Object.keys(errors).length > 0 ? 'Some hours are invalid; check the highlighted fields.' : errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'error') return <Alert type="error" showIcon message={state.message} description={state.reference} action={<Button onClick={reload}>Retry</Button>} />;
  const status = record?.status;
  return (
    <SectionCard
      title="Opening hours"
      description="When the business is open. Saved on its own, separately from the fields above."
      extra={
        status && (
          <Space>
            <Tag color={status.state === 'open' ? 'green' : status.state === 'closed' ? 'default' : 'orange'}>{status.state === 'unknown' ? 'hours unknown' : `${status.state} now`}</Tag>
            {status.until && <Typography.Text type="secondary">until {formatDateTime(status.until)}</Typography.Text>}
          </Space>
        )
      }
      style={{ marginBottom: 24 }}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Form<HoursFormValues> form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={readOnly || state.status !== 'ready'} initialValues={{ mode: 'unknown', weekly: emptyWeek(), exceptions: [] }}>
        <Form.Item label="Hours" name="mode" extra="Unknown hours are never shown as open or closed on the public site.">
          <Select style={{ maxWidth: 320 }} options={[{ value: 'unknown', label: 'Not recorded yet' }, { value: 'scheduled', label: 'Weekly schedule' }]} />
        </Form.Item>
        {mode === 'scheduled' && (
          <>
            {WEEKDAYS.map((day) => (
              // Columns in the stylesheet: on a phone the day and its state share
              // a row and the opening times take the next one.
              <div key={day} className="ms-hours-day">
                <Typography.Text strong style={{ paddingTop: 6 }}>{capitalise(day)}</Typography.Text>
                <Form.Item name={['weekly', day, 'state']} style={{ marginBottom: 8 }}>
                  <Select aria-label={`${capitalise(day)} hours`} options={DAY_STATES} />
                </Form.Item>
                <div>{weekly?.[day]?.state === 'intervals' && <IntervalRows name={['weekly', day, 'intervals']} disabled={readOnly} />}</div>
              </div>
            ))}
            <Typography.Title level={3} style={{ fontSize: 16, marginTop: 16 }}>Date exceptions</Typography.Title>
            <Typography.Paragraph type="secondary">Public holidays and one-off changes override the weekly schedule for that date.</Typography.Paragraph>
            <Form.List name="exceptions">
              {(fields, { add, remove }) => (
                <div>
                  {fields.map((field, index) => (
                    <div key={field.key} style={{ border: `1px solid ${brand.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div className="ms-field-row">
                        <Form.Item name={[field.name, 'date']} label="Date" rules={[{ required: true, message: 'Date is required' }]} style={{ width: 170 }}>
                          <Input type="date" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'kind']} label="Hours" style={{ width: 170 }}>
                          <Select aria-label="Exception hours" style={{ width: '100%' }} options={EXCEPTION_KINDS} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'note']} label="Note" style={{ width: 220 }}>
                          <Input maxLength={120} placeholder="e.g. Christmas Day" />
                        </Form.Item>
                        <Button type="text" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label="Remove exception" onClick={() => remove(field.name)} />
                      </div>
                      {exceptions?.[index]?.kind === 'custom' && <IntervalRows name={[field.name, 'intervals']} disabled={readOnly} />}
                    </div>
                  ))}
                  {fields.length < 60 && (
                    <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => add({ date: '', kind: 'closed', intervals: [], note: '' })}>
                      Add exception
                    </Button>
                  )}
                </div>
              )}
            </Form.List>
          </>
        )}
        {!readOnly && (
          <div style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={saving}>Save hours</Button>
          </div>
        )}
      </Form>
    </SectionCard>
  );
}
