import { useState } from 'react';
import { Button, DatePicker, Drawer, Grid, Input, Pagination, Segmented, Skeleton, Switch, Tag } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { adminsApi, auditApi } from '@/api/admins';
import { adelaideLocalToUtc, adelaideOffsetLabel } from '@/api/blog';
import { ErrorState, FilterSummary, ListEmpty, PageHeader } from '@/components/ui';
import { RemoteSelect } from '@/components/RemoteSelect';
import { adelaideDayKey } from '@/shared/activity';
import { useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { ActivityFeed } from './activity/ActivityFeed';
import { AreaChips } from './activity/AreaChips';
import { fromAuditEntry } from './activity/activity-items';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['action', 'category', 'outcome', 'requestId', 'actor', 'from', 'to', 'each'] as const;

/** An action code or prefix (`auth.*`, `listing.publish`); anything else typed is taken as a request id. */
const ACTION_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]*)*\*?$/i;

/**
 * The consolidated activity log (SRS 1.2 ACT 001–005, change log 1.14), as a
 * timeline: a heading per Adelaide day, each event a sentence, repeated events
 * folded into one row with a count.
 *
 * What is listed follows the reader's permissions area by area — the chips show
 * only the areas they may read — and the server enforces the same scope on
 * every request. Read-only: nothing here edits or deletes an event.
 *
 * Dates are entered and read in Adelaide time (NFR 012) and converted once,
 * here, so a range never means a different day to the reader than to the server.
 */
export function AuditLogPage() {
  useDocumentTitle('Activity log');
  const screens = Grid.useBreakpoint();
  const narrow = screens.md === false;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const list = useListParams(FILTERS);
  const page = list.page;
  const action = list.get('action') ?? '';
  const category = list.get('category') ?? '';
  const outcome = list.get('outcome') ?? '';
  const requestId = list.get('requestId') ?? '';
  const actor = list.get('actor') ?? '';
  const from = list.get('from') ?? '';
  const to = list.get('to') ?? '';
  const everyEvent = list.get('each') === '1';
  // One request is an investigation: every event is shown on its own.
  const grouped = !everyEvent && !requestId;
  const offset = adelaideOffsetLabel(new Date());

  const [state, reload] = useAsync(
    (signal) =>
      auditApi.list(
        {
          page,
          pageSize: list.pageSize,
          action: action || undefined,
          category: category || undefined,
          outcome: (outcome || undefined) as 'success' | 'failure' | undefined,
          requestId: requestId || undefined,
          actorAdminId: actor || undefined,
          // A day chosen on screen is a Adelaide day: it starts at midnight
          // there and ends a minute before the next one, whatever the reader's
          // own clock says.
          from: from ? (adelaideLocalToUtc(`${from}T00:00`)?.toISOString() ?? undefined) : undefined,
          to: to ? (adelaideLocalToUtc(`${to}T23:59`)?.toISOString() ?? undefined) : undefined,
          grouped: grouped ? 'true' : 'false',
        },
        signal,
      ),
    [page, list.pageSize, action, category, outcome, requestId, actor, from, to, grouped],
  );

  const today = adelaideDayKey(new Date());
  const [summary] = useAsync(
    (signal) => auditApi.summary((adelaideLocalToUtc(`${today}T00:00`) ?? new Date()).toISOString(), signal),
    [today],
  );

  const range: [Dayjs | null, Dayjs | null] = [from ? dayjs(from) : null, to ? dayjs(to) : null];
  const search = (value: string) => {
    const typed = value.trim();
    const isAction = typed !== '' && ACTION_PATTERN.test(typed) && (typed.includes('.') || typed.endsWith('*'));
    list.setMany({ action: isAction ? typed : undefined, requestId: typed !== '' && !isAction ? typed : undefined });
  };
  const showRequest = (id: string) => {
    list.setMany({ action: undefined, requestId: id });
  };

  const whoControl = (
    <RemoteSelect
      ariaLabel="Filter by who did it"
      placeholder="Anyone"
      value={actor || undefined}
      valueLabel={actor === 'system' ? 'The system itself' : undefined}
      onChange={(value) => list.set('actor', value)}
      width={narrow ? undefined : 230}
      search={(term, signal) =>
        adminsApi.list({ q: term || undefined, pageSize: 20, sort: 'displayName', order: 'asc' }, signal).then((result) => [
          // Automatic events have no administrator; they can be picked out, or left out by picking someone.
          ...(!term || 'the system itself'.includes(term.toLowerCase()) ? [{ value: 'system', label: 'The system itself' }] : []),
          ...result.data.map((row) => ({ value: row.id, label: `${row.displayName} (${row.email})` })),
        ])
      }
    />
  );
  const dateControl = (
    <DatePicker.RangePicker placeholder={["From", "To"]}
      aria-label={`Limit to a date range, Adelaide time (${offset})`}
      value={range}
      format="DD MMM YYYY"
      allowEmpty={[true, true]}
      style={narrow ? { width: '100%' } : undefined}
      onChange={(values) => {
        list.setMany({ from: values?.[0] ? values[0].format('YYYY-MM-DD') : undefined, to: values?.[1] ? values[1].format('YYYY-MM-DD') : undefined });
      }}
    />
  );
  const outcomeControl = (
    <Segmented
      aria-label="Filter by outcome"
      value={outcome}
      onChange={(value) => list.set('outcome', String(value) || undefined)}
      options={[
        { label: 'All', value: '' },
        { label: 'Succeeded', value: 'success' },
        { label: 'Refused or failed', value: 'failure' },
      ]}
    />
  );

  const active: Array<{ key: string; label: string; clear: () => void }> = [];
  if (action) active.push({ key: 'action', label: `Action: ${action}`, clear: () => list.set('action', undefined) });
  if (requestId) active.push({ key: 'requestId', label: `Request: ${requestId}`, clear: () => list.set('requestId', undefined) });
  if (actor) active.push({ key: 'actor', label: actor === 'system' ? 'Who: the system itself' : 'Who: one administrator', clear: () => list.set('actor', undefined) });
  if (from || to) active.push({ key: 'dates', label: `Dates: ${from ? dayjs(from).format('D MMM YYYY') : 'any'} – ${to ? dayjs(to).format('D MMM YYYY') : 'any'}`, clear: () => list.setMany({ from: undefined, to: undefined }) });
  if (outcome) active.push({ key: 'outcome', label: outcome === 'failure' ? 'Refused or failed' : 'Succeeded', clear: () => list.set('outcome', undefined) });

  const entries = state.status === 'ready' ? state.data.data.map(fromAuditEntry) : [];
  const total = state.status === 'ready' ? state.data.meta.total : 0;
  const pagination = state.status === 'ready' ? tablePagination(state.data.meta, list) : false;

  return (
    <div className="as-activity-page">
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Activity log' }]}
        title="Activity log"
        description="Every change and operational event, with who did it. Entries are never edited or deleted."
        actions={
          <span className="as-activity-switch">
            <Switch id="activity-every-event" checked={!grouped} disabled={Boolean(requestId)} onChange={(checked) => list.set('each', checked ? '1' : undefined)} />
            <label htmlFor="activity-every-event">Show every event</label>
          </span>
        }
      />

      <AreaChips areas={summary.status === 'ready' ? summary.data.areas : null} value={category || undefined} onChange={(value) => list.set('category', value)} />

      <div className="as-activity-card">
        <div className="as-activity-toolbar">
          <Input.Search
            key={`${action}|${requestId}`}
            className="as-activity-search"
            aria-label="Search by action code (for example auth.*) or request id"
            placeholder="Action, e.g. auth.*, or a request id"
            allowClear
            defaultValue={action || requestId}
            onSearch={search}
          />
          {narrow ? (
            <Button icon={<FilterOutlined aria-hidden="true" />} onClick={() => setFiltersOpen(true)}>
              Filters{active.length > 0 ? ` (${active.length})` : ''}
            </Button>
          ) : (
            <>
              {whoControl}
              {dateControl}
              {outcomeControl}
            </>
          )}
        </div>

        {active.length > 0 && (
          <div className="as-activity-filters-active">
            <FilterSummary onClear={list.clear}>
              {active.map((filter) => (
                <Tag key={filter.key} closable onClose={filter.clear} closeIcon={<span aria-label={`Remove ${filter.label}`}>×</span>}>
                  {filter.label}
                </Tag>
              ))}
            </FilterSummary>
          </div>
        )}

        {state.status === 'ready' && total > 0 && (
          <p className="as-activity-summary" role="status">
            {total} {grouped ? (total === 1 ? 'entry' : 'entries') : total === 1 ? 'event' : 'events'}
            {grouped ? ', repeated events grouped' : ''}
            {list.filtered ? ' matching your filters' : ''}
          </p>
        )}

        {state.status === 'error' && (
          <div className="as-activity-skeleton">
            <ErrorState message={state.message} reference={state.reference} onRetry={reload} />
          </div>
        )}
        {state.status === 'loading' && (
          <div className="as-activity-skeleton" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} active avatar={{ shape: 'square', size: 32 }} title={false} paragraph={{ rows: 2 }} />
            ))}
          </div>
        )}
        {state.status === 'ready' && entries.length > 0 && <ActivityFeed entries={entries} onShowRequest={showRequest} />}
        {state.status === 'ready' && entries.length === 0 && (
          <div className="as-activity-skeleton">
            <ListEmpty state={state} filtered={list.filtered} noun="activity" onClear={list.clear} empty={{ title: 'No activity recorded yet', description: 'Every change an administrator makes is recorded here.' }} />
          </div>
        )}

        {pagination && total > 0 && (
          <div className="as-activity-pagination">
            <Pagination {...pagination} size={narrow ? 'small' : 'default'} simple={narrow} />
          </div>
        )}
      </div>

      <Drawer title="Filter activity" placement="bottom" height="auto" open={narrow && filtersOpen} onClose={() => setFiltersOpen(false)}>
        <div className="as-activity-drawer">
          {whoControl}
          {dateControl}
          {outcomeControl}
          <Button type="primary" block onClick={() => setFiltersOpen(false)}>
            Show results
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
