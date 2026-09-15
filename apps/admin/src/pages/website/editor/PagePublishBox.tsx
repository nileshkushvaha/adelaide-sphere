import { useState } from 'react';
import { Alert, Button, DatePicker, Input, Modal, Space, Typography, theme } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { adelaideLocalToUtc, adelaideOffsetLabel, utcToAdelaideLocal } from '@/api/blog';
import { CheckCircleOutlined, ExclamationCircleOutlined, ExportOutlined } from '@ant-design/icons';
import type { StaticPage } from '@/api/settings';
import { SectionCard, StatusTag } from '@/components/ui';
import { formatDateTime } from '@/shared/format';

/** The time the schedule picker starts at: the chosen time, or an hour from now on the hour (Adelaide time). */
function initialScheduleValue(scheduledAt: string | null | undefined): Dayjs {
  if (scheduledAt) return dayjs(utcToAdelaideLocal(new Date(scheduledAt)));
  return dayjs(utcToAdelaideLocal(new Date(Date.now() + 3_600_000))).minute(0);
}

const isInFuture = (instant: Date) => instant.getTime() > Date.now();

interface Props {
  page: StaticPage | null;
  /** What still stops publication: the API's list for the saved page, or the live checks while editing. */
  blockers: string[];
  /** True when the list above comes from what is typed rather than what is saved. */
  blockersAreLive: boolean;
  dirty: boolean;
  saving: boolean;
  changingStatus: boolean;
  canSave: boolean;
  canPublish: boolean;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: (reason: string) => void;
  /** Schedules publication at a UTC instant chosen in Adelaide time. */
  onSchedule: (scheduledAt: string) => void;
  onUnschedule: () => void;
  /** The public address, for "View on site". */
  liveHref: string | null;
  /** Opens a private preview in the public design; null when the page cannot be previewed yet, with why. */
  onPreview: () => void;
  previewDisabledReason: string | null;
  previewing: boolean;
  /** Opens the version history; omitted for a page that has never been saved. */
  onHistory?: () => void;
  /** What the automatic copy of unsaved changes last did. */
  autosaveText: string | null;
}

/**
 * Where the page stands and what is left before it can go live: the status,
 * a checklist in plain sentences, and the buttons that save, publish or take
 * the page down. Publishing works on what is saved, so it waits for a save.
 */
export function PagePublishBox({ page, blockers, blockersAreLive, dirty, saving, changingStatus, canSave, canPublish, onSave, onPublish, onUnpublish, onSchedule, onUnschedule, liveHref, onPreview, previewDisabledReason, previewing, onHistory, autosaveText }: Props) {
  const { token } = theme.useToken();
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [reason, setReason] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState<Dayjs | null>(null);
  const [scheduleProblem, setScheduleProblem] = useState<string | null>(null);
  const isNew = page === null;
  const status = page?.status ?? 'draft';
  const published = status === 'published';
  const saveLabel = isNew ? 'Create page' : published ? 'Update page' : 'Save draft';
  const publishDisabledReason = isNew ? 'Create the page first.' : dirty ? 'Save your changes first.' : blockers.length > 0 ? 'Finish the checklist first.' : null;
  const busy = saving || changingStatus;
  const scheduledInstant = when ? adelaideLocalToUtc(when.format('YYYY-MM-DDTHH:mm')) : null;

  const openSchedule = () => {
    // The time already chosen, or an hour from now on the hour, in Adelaide time.
    setWhen(initialScheduleValue(page?.scheduledAt));
    setScheduleProblem(null);
    setScheduling(true);
  };

  const confirmSchedule = () => {
    if (!scheduledInstant) {
      setScheduleProblem('Choose a date and time.');
      return;
    }
    if (!isInFuture(scheduledInstant)) {
      setScheduleProblem('Choose a time in the future.');
      return;
    }
    onSchedule(scheduledInstant.toISOString());
    setScheduling(false);
  };

  return (
    <SectionCard title="Publish" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        <Space size={8} wrap>
          <Typography.Text type="secondary">Status:</Typography.Text>
          {isNew ? <Typography.Text>Not created yet</Typography.Text> : <StatusTag status={status} />}
          {dirty && <Typography.Text type="warning">Unsaved changes</Typography.Text>}
        </Space>
        {page && page.version > 0 && <Typography.Text type="secondary">Last saved {formatDateTime(page.updatedAt)}</Typography.Text>}
        {page?.publishedAt && published && <Typography.Text type="secondary">Published {formatDateTime(page.publishedAt)}</Typography.Text>}
        {status === 'scheduled' && page?.scheduledAt && <Typography.Text strong>Goes live {formatDateTime(page.scheduledAt)}</Typography.Text>}
        {autosaveText && (
          <Typography.Text type="secondary" role="status" style={{ fontSize: 12.5 }}>
            {autosaveText}
          </Typography.Text>
        )}
      </Space>

      {!published && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text strong role="status" style={{ display: 'block' }}>
            {blockers.length === 0 ? 'Ready to publish' : 'Not ready to publish'}
          </Typography.Text>
          {blockersAreLive && (
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              Checked again in full when you save.
            </Typography.Text>
          )}
          {blockers.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {blockers.map((blocker) => (
                <li key={blocker} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', fontSize: 13.5 }}>
                  <ExclamationCircleOutlined aria-hidden="true" style={{ color: token.colorWarning, marginTop: 3 }} />
                  <span className="sr-only">To do:</span>
                  <span>{blocker}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13.5, display: 'flex', gap: 8 }}>
              <CheckCircleOutlined aria-hidden="true" style={{ color: token.colorSuccess, marginTop: 3 }} />
              <span>A title, enough real text and finished sections.</span>
            </Typography.Paragraph>
          )}
        </div>
      )}

      {canSave && !canPublish && !isNew && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="You can edit and save this page" description="Publishing needs the Pages “Publish” permission. Ask the administrator who manages access." />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
        <Space wrap size={8}>
          {canSave && (
            <Button type={published || isNew ? 'primary' : 'default'} onClick={onSave} loading={saving} disabled={saving || changingStatus || (!dirty && !isNew)}>
              {saveLabel}
            </Button>
          )}
          <Button onClick={onPreview} loading={previewing} disabled={previewDisabledReason !== null} title={previewDisabledReason ?? undefined}>
            Preview
          </Button>
          {onHistory && <Button onClick={onHistory}>History</Button>}
          {published && liveHref && (
            <Button href={liveHref} target="_blank" rel="noreferrer noopener" icon={<ExportOutlined aria-hidden="true" />}>
              View on site
            </Button>
          )}
        </Space>
        {canPublish && !isNew && (
          <Space wrap size={8}>
            {published ? (
              <Button danger onClick={() => setConfirmingUnpublish(true)} disabled={busy}>
                Unpublish
              </Button>
            ) : (
              <>
                {status === 'scheduled' && (
                  <Button onClick={onUnschedule} disabled={busy}>
                    Unschedule
                  </Button>
                )}
                <Button onClick={openSchedule} disabled={busy || publishDisabledReason !== null} title={publishDisabledReason ?? undefined}>
                  {status === 'scheduled' ? 'Change time' : 'Schedule'}
                </Button>
                <Button type="primary" onClick={onPublish} loading={changingStatus} disabled={saving || publishDisabledReason !== null} title={publishDisabledReason ?? undefined}>
                  Publish
                </Button>
              </>
            )}
          </Space>
        )}
      </div>
      {!published && canPublish && !isNew && publishDisabledReason && (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 8 }}>
          {publishDisabledReason}
        </Typography.Text>
      )}

      <Modal
        open={confirmingUnpublish}
        title="Unpublish this page?"
        okText="Unpublish"
        okButtonProps={{ danger: true, loading: changingStatus, disabled: reason.trim().length < 3 }}
        onOk={() => {
          onUnpublish(reason.trim());
          setConfirmingUnpublish(false);
          setReason('');
        }}
        onCancel={() => setConfirmingUnpublish(false)}
        destroyOnHidden
      >
        <Typography.Paragraph>Visitors will get a “page not found” at its address, and menu links to it are hidden until it is published again. Nothing on the page is lost.</Typography.Paragraph>
        <label htmlFor="page-unpublish-reason" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
          Why is it being taken down?
        </label>
        <Input.TextArea id="page-unpublish-reason" rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. The offer has ended" />
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          Required, at least 3 characters. Kept in the activity log.
        </Typography.Text>
      </Modal>

      <Modal open={scheduling} title="Schedule publication" okText="Schedule" onOk={confirmSchedule} onCancel={() => setScheduling(false)} destroyOnHidden>
        <Typography.Paragraph>The page goes live within a few minutes of this time, even if nobody is signed in. If it no longer passes the checklist then, it goes back to draft and says why.</Typography.Paragraph>
        <label htmlFor="page-schedule-time" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
          Publish at (Adelaide time, {adelaideOffsetLabel(scheduledInstant ?? new Date())})
        </label>
        <DatePicker
          id="page-schedule-time"
          value={when}
          onChange={(value) => {
            setWhen(value);
            setScheduleProblem(null);
          }}
          showTime={{ format: 'HH:mm', minuteStep: 5 }}
          format="YYYY-MM-DD HH:mm"
          needConfirm={false}
          disabledDate={(day) => day.isBefore(dayjs().startOf('day'))}
          style={{ width: '100%' }}
          placeholder="YYYY-MM-DD HH:mm"
          status={scheduleProblem ? 'error' : undefined}
        />
        <Typography.Text type={scheduleProblem ? 'danger' : 'secondary'} role={scheduleProblem ? 'alert' : undefined} style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>
          {scheduleProblem ?? (when && scheduledInstant ? `Goes live ${when.format('dddd D MMMM YYYY [at] h:mm a')} Adelaide time, whatever time zone this computer is in.` : 'Type a date and time, or pick one from the calendar.')}
        </Typography.Text>
      </Modal>
    </SectionCard>
  );
}
