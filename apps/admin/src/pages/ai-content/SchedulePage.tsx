import { Alert, App, Button, Card, Descriptions, Input, Table, Typography } from "antd";
import { Link } from "react-router";
import { aiContentApi, type ScheduleSlot, type ScheduleStatus } from "@/api/ai-content";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import { ErrorState, PageHeader, PageLoader, TableCard, StatusTag } from "@/components/ui";
import { errorMessage, useAsync } from "@/shared/useAsync";
import { useDocumentTitle } from "@/shared/useDocumentTitle";

const localTime = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-AU", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
const words = (value: string | null) => (value ?? "").replace(/_/g, " ").replace(":", ": ");

/**
 * The daily AI slot (Phase 1F): when it runs, what waits for it, and every
 * slot with what it did. A slot only starts free research for a topic a
 * person approved for it; a missed slot is held here for review, never caught up.
 */
export function SchedulePage() {
  useDocumentTitle("AI schedule");
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.schedule(), []);
  if (state.status === "loading") return <PageLoader />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  const s: ScheduleStatus = state.data;
  const review = (slot: ScheduleSlot) => {
    let note = "";
    modal.confirm({
      title: `Mark the missed slot of ${slot.localDate} as reviewed?`,
      content: <Input.TextArea placeholder="What you checked or decided" aria-label="What you checked or decided" rows={3} maxLength={500} onChange={(e) => (note = e.target.value)} />,
      okText: "Mark reviewed",
      onOk: async () => {
        try {
          await aiContentApi.reviewSlot(slot, note);
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };
  return (
    <>
      <PageHeader title="AI schedule" description="One daily slot starts research for the next topic a person approved. It never publishes." crumbs={[{ label: "AI Content", href: "/ai-content" }]} />
      {!s.active && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="The daily slot is off" description="Turn on automation and the daily slot in AI Settings to use it." />}
      {s.missedAwaitingReview > 0 && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`${s.missedAwaitingReview} missed slot${s.missedAwaitingReview === 1 ? "" : "s"} to review`} />}
      <Card title={<h2 className="as-ai-card-heading">Daily research window</h2>} style={{ marginBottom: 16 }}>
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "time", label: "Time", children: s.slotTime ? `${s.slotTime} (${s.timeZone}) on ${s.weekdays.join(", ")}` : "Not set" },
            { key: "next", label: "Next slot", children: s.active && s.next ? localTime(s.next.dueAt, s.timeZone) : "—" },
            { key: "month", label: "This month", children: `${s.usedThisMonth} of at most ${s.maxPerMonth} slots used` },
            { key: "grace", label: "Grace period", children: `${s.graceMinutes} minutes; later than that is recorded as missed` },
          ]}
        />
      </Card>
      <Card title={`Waiting for a slot (${s.waiting.length})`} style={{ marginBottom: 16 }}>
        {s.waiting.length === 0 ? (
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            No topic is approved for the daily slot. Approve one from its topic page.
          </Typography.Paragraph>
        ) : (
          <ol style={{ margin: 0, paddingInlineStart: 20 }}>
            {s.waiting.map((t) => (
              <li key={t.id}>
                <Link to={`/ai-content/topics/${t.id}`}>{t.title}</Link> <Typography.Text type="secondary">priority {t.priority}</Typography.Text>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <TableCard>
        <Table
          rowKey="id"
          dataSource={s.slots}
          pagination={false}
          scroll={{ x: 850 }}
          locale={{ emptyText: "No slots yet" }}
          columns={[
            { title: "Date", dataIndex: "localDate" },
            { title: "State", render: (_: unknown, slot: ScheduleSlot) => <StatusTag status={slot.state} /> },
            { title: "Topic", render: (_: unknown, slot: ScheduleSlot) => (slot.item ? <Link to={`/ai-content/topics/${slot.item.id}`}>{slot.item.title}</Link> : "—") },
            { title: "Reason", render: (_: unknown, slot: ScheduleSlot) => words(slot.reason) || "—" },
            { title: "Review", render: (_: unknown, slot: ScheduleSlot) => slot.resolutionNote ?? "—" },
            {
              title: "Action",
              render: (_: unknown, slot: ScheduleSlot) =>
                slot.state === "missed" && can(PERMISSION.aiContentReview) ? (
                  <Button size="small" onClick={() => review(slot)}>
                    Mark reviewed
                  </Button>
                ) : null,
            },
          ]}
        />
      </TableCard>
    </>
  );
}
