import { useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import { Link, useParams, useSearchParams } from "react-router";
import {
  aiContentApi,
  type AiAttention,
  type AiTopic,
  type TopicInput,
  type TopicStatus,
  TOPIC_STATUSES,
  TOPIC_STATUS_LABELS,
} from "@/api/ai-content";
import { isApiError } from "@/api/errors";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import { ErrorState, PageHeader, PageLoader, TableCard, StatCard, StatusTag } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useUnsavedChanges } from "@/shared/useUnsavedChanges";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { NoveltyCard, ResearchCard, SourcesCard } from "./ResearchPanels";
import { ArticleCard, BudgetCard } from "./GenerationPanels";
import { FeaturedImageCard } from "./ImagePanels";

export function AutomationNotice() {
  return (
    <Alert
      type="info"
      showIcon
      message="Human review required"
      description="Drafts come only from verified research, within the budget, and never publish without approval."
      style={{ marginBottom: 20 }}
    />
  );
}
const date = (value: string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function AiOverviewPage() {
  useDocumentTitle("AI Content");
  const { can } = useCapabilities();
  const [state, reload] = useAsync(() => aiContentApi.overview(), []);
  return (
    <>
      <PageHeader
        title="AI Content"
        description="Plan topics, verify evidence and prepare articles for human approval."
        actions={<Button type="primary" href="/admin/ai-content/topics">Open topic queue</Button>}
      />
      <AutomationNotice />
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <>
          <div className="as-ai-stats">
            {(["queued", "researching", "ready_for_review", "needs_fact_review", "scheduled", "failed"] as const).map((key) => (
              <StatCard key={key} label={key === "researching" ? "Processing" : TOPIC_STATUS_LABELS[key]} value={key === "researching" ? (state.data.counts.researching ?? 0) + (state.data.counts.generating ?? 0) : state.data.counts[key] ?? 0}
                hint={key === "researching" ? "Researching or generating" : "View topics"}
                tone={key === "failed" ? "critical" : key === "needs_fact_review" ? "attention" : "neutral"}
                href={key === "needs_fact_review" ? "/ai-content/fact-review" : `/ai-content/topics?status=${key === "researching" ? "all" : key}`} />
            ))}
          </div>
          <Collapse style={{ marginBottom: 20 }} items={[{ key: "counts", label: "All workflow statuses", children:
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} items={TOPIC_STATUSES.map((key) => ({ key, label: TOPIC_STATUS_LABELS[key], children: <Link to={`/ai-content/topics?status=${key}`}>{state.data.counts[key] ?? 0} topics</Link> }))} />,
          }]} />
          <Card title={<h2 className="as-ai-card-heading">Workspace status</h2>}>
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} items={[
              { key: "enabled", label: "Automation", children: <StatusTag status={state.data.enabled ? "active" : "disabled"} /> },
              { key: "research", label: "Research", children: <StatusTag status={state.data.executionActive ? "active" : "inactive"} /> },
              { key: "generation", label: "Article generation", children: state.data.generationAvailable ? "Available within budget" : "Setup required" },
            ]} />
          </Card>
        </>
      )}
      {state.status === "ready" && <AttentionCard attention={state.data.attention} />}
      {state.status === "ready" && <BudgetCard />}
      <Space wrap style={{ marginTop: 16 }}>
        <Link to="/ai-content/topics">Topic Queue</Link>
        {can(PERMISSION.aiContentConfigure) && (
          <Link to="/ai-content/settings">AI Settings</Link>
        )}
      </Space>
    </>
  );
}
const hours = (seconds: number) => (seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`);

/**
 * What needs an operator now (Phase 1G): the same figures the alert rules use,
 * each with where to act. Nothing is shown when nothing needs attention.
 */
function AttentionCard({ attention: a }: { attention: AiAttention }) {
  const { can } = useCapabilities();
  const warn = a.budgetWarningPercent / 100;
  const over = (["textDay", "textMonth", "imageDay", "imageMonth"] as const).filter((k) => a.budgetUsed[k] >= warn);
  const items = [
    a.paidCallsHalted && { key: "halt", type: "error" as const, text: `Paid AI calls are halted: ${a.paidHaltReason ?? "reconciliation required"}.`, link: "/ai-content/pricing", action: "Reconcile on AI Pricing" },
    a.outcomeUnknownOperations > 0 && { key: "unknown", type: "error" as const, text: `${a.outcomeUnknownOperations} AI request${a.outcomeUnknownOperations === 1 ? "" : "s"} with an unknown outcome. They are never sent again automatically.`, link: "/ai-content/topics", action: "Resolve on the topic" },
    a.factReviewItems > 0 && { key: "facts", type: "warning" as const, text: `${a.factReviewItems} article${a.factReviewItems === 1 ? "" : "s"} in fact review; the oldest has waited ${hours(a.factReviewOldestSeconds)}.`, link: "/ai-content/fact-review", action: "Open Fact Review" },
    a.missedSlotsUnreviewed > 0 && { key: "slots", type: "warning" as const, text: `${a.missedSlotsUnreviewed} missed daily slot${a.missedSlotsUnreviewed === 1 ? "" : "s"} to review.`, link: "/ai-content/schedule", action: "Open AI Schedule" },
    a.failedItems > 0 && { key: "failed", type: "warning" as const, text: `${a.failedItems} topic${a.failedItems === 1 ? "" : "s"} failed.`, link: "/ai-content/topics?status=failed", action: "See failed topics" },
    a.oldestOpenOperationSeconds > 1800 && { key: "stuck", type: "warning" as const, text: `AI work has been waiting ${hours(a.oldestOpenOperationSeconds)}. Check that the worker is running.`, link: "/system/queues", action: "Open Queue Monitor" },
    over.length > 0 && { key: "budget", type: "info" as const, text: `AI budget over ${a.budgetWarningPercent}% (${over.map((k) => k.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}).`, link: "/ai-content/pricing", action: "See the budget" },
  ].filter(Boolean) as { key: string; type: "error" | "warning" | "info"; text: string; link: string; action: string }[];
  if (items.length === 0) return null;
  return (
    <Card title={<h2 className="as-ai-card-heading">Needs attention</h2>} style={{ marginTop: 16 }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        {items.map((i) => (
          <Alert key={i.key} type={i.type} showIcon message={i.text} action={(i.link !== "/ai-content/pricing" || can(PERMISSION.aiContentConfigure)) && (i.link !== "/system/queues" || can(PERMISSION.systemQueuesView)) ? <Link to={i.link}>{i.action}</Link> : undefined} />
        ))}
      </Space>
    </Card>
  );
}

export function AiTopicDetailPage() {
  useDocumentTitle("AI topic");
  const { id = "" } = useParams();
  const { can } = useCapabilities();
  const canReview = can(PERMISSION.aiContentReview);
  const [state, reload] = useAsync(() => aiContentApi.detail(id), [id]);
  return (
    <>
      <PageHeader
        title={state.status === "ready" ? state.data.title : "Topic detail"}
        description="Work through the evidence, article and image checks before approval."
        meta={state.status === "ready" ? <StatusTag status={state.data.status} label={TOPIC_STATUS_LABELS[state.data.status]} /> : undefined}
        crumbs={[{ label: "Topic Queue", href: "/ai-content/topics" }]}
      />
      <AutomationNotice />
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <Card>
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 0 }}>Editorial brief</Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
            {state.data.brief || "No editorial brief."}
          </Typography.Paragraph>
          <Descriptions
            column={{ xs: 1, md: 2 }}
            items={[
              {
                key: "status",
                label: "Status",
                children: <StatusTag status={state.data.status} label={TOPIC_STATUS_LABELS[state.data.status]} />,
              },
              {
                key: "article",
                label: "Article",
                children: state.data.postId ? (
                  <Link to={`/posts/${state.data.postId}`}>Open the article</Link>
                ) : (
                  "No article yet"
                ),
              },
              ...(state.data.humanModifiedAt
                ? [
                    {
                      key: "human",
                      label: "Edited by a person (Adelaide time)",
                      children: `${date(state.data.humanModifiedAt)}. Automation will not change this article.`,
                    },
                  ]
                : []),
              ...(state.data.status === "failed"
                ? [
                    {
                      key: "failure",
                      label: "Failure",
                      children: `${state.data.failureStage ?? "unknown stage"}: ${state.data.failureCode ?? "no code recorded"}`,
                    },
                  ]
                : []),
              {
                key: "priority",
                label: "Priority",
                children: state.data.priority,
              },
              { key: "source", label: "Source", children: state.data.source === "manual" ? "Added by an editor" : "Public feed discovery" },
              ...(state.data.selectionReason ? [{ key: "why", label: "Why selected", children: state.data.selectionReason }] : []),
              ...(state.data.followUpReason ? [{ key: "followup", label: "Follow-up justification", children: state.data.followUpReason }] : []),
              {
                key: "created",
                label: "Created (Adelaide time)",
                children: date(state.data.createdAt),
              },
              {
                key: "updated",
                label: "Updated (Adelaide time)",
                children: date(state.data.updatedAt),
              },
              {
                key: "version",
                label: "Version",
                children: state.data.version,
              },
              {
                key: "reason",
                label: "Reason",
                children: state.data.reason ?? "None",
              },
            ]}
          />
        </Card>
      )}
      {state.status === "ready" && (
        <>
          <nav className="as-ai-stage-nav" aria-label="Topic review stages"><a href="#topic-research">1. Research & facts</a><a href="#topic-article">2. Article & approval</a>{state.data.postId && <a href="#topic-image">3. Featured image</a>}</nav>
          <section id="topic-research" className="as-ai-section" aria-label="Research and facts">
          <NoveltyCard topic={state.data} canReview={canReview} onChange={() => reload()} />
          <SourcesCard key={`${state.data.id}-${state.data.version}`} topic={state.data} canReview={canReview} onChange={() => reload()} />
          <ResearchCard topic={state.data} canReview={canReview} onChange={() => reload()} />
          </section>
          <section id="topic-article" className="as-ai-section" aria-label="Article and approval">
          <ArticleCard topic={state.data} onChange={() => reload()} />
          </section>
          {state.data.postId && <section id="topic-image" className="as-ai-section" aria-label="Featured image"><FeaturedImageCard topic={state.data} onChange={() => reload()} /></section>}
        </>
      )}
    </>
  );
}
/** The first-class Needs Fact Review queue (AI SRS §14). */
export function AiFactReviewPage() {
  return <AiTopicQueuePage initialStatus="needs_fact_review" heading="Fact review" />;
}
export function AiTopicQueuePage({ initialStatus = "queued", heading = "Topic Queue" }: { initialStatus?: TopicStatus; heading?: string } = {}) {
  useDocumentTitle(heading === "Topic Queue" ? "AI Topic Queue" : `AI ${heading}`);
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const manage = can(PERMISSION.aiContentManageTopics);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status");
  const status = requestedStatus === "all" ? undefined : TOPIC_STATUSES.includes(requestedStatus as TopicStatus) ? requestedStatus as TopicStatus : initialStatus;
  const setStatus = (value: TopicStatus | undefined) => setSearchParams((previous) => { previous.set("status", value ?? "all"); return previous; });
  const review = can(PERMISSION.aiContentReview);
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [state, reload] = useAsync(
    (signal) => aiContentApi.list({ page, pageSize, status, q }, signal),
    [page, pageSize, status, q],
  );
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [createForm] = Form.useForm<TopicInput>();
  const [actionForm] = Form.useForm<{ priority: number; reason: string }>();
  const requestKey = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<{
    topic: AiTopic;
    action: "pause" | "resume" | "cancel" | "reject" | "priority";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const create = async (values: TopicInput) => {
    setSaving(true);
    setError(null);
    try {
      await aiContentApi.create(values, requestKey.current);
      createForm.resetFields();
      setDirty(false);
      requestKey.current = crypto.randomUUID();
      message.success("Manual topic created.");
      reload();
    } catch (e) {
      createForm.setFields(
        Object.entries(fieldErrors(e) ?? {})
          .filter(([name]) => ["title", "brief", "priority"].includes(name))
          .map(([name, errors]) => ({
            name: name as keyof TopicInput,
            errors,
          })),
      );
      setError(
        isApiError(e) && e.code === "DUPLICATE_ACTIVE_TOPIC"
          ? "A queued or paused topic already has this title. Your input has been kept; check both queues."
          : isApiError(e) && e.code === "IDEMPOTENCY_MISMATCH"
            ? "This request was already submitted with different input. Restore the submitted values or explicitly start a new request."
            : errorMessage(e),
      );
    } finally {
      setSaving(false);
    }
  };
  const openAction = (
    topic: AiTopic,
    action: NonNullable<typeof selected>["action"],
  ) => {
    setSelected({ topic, action });
    setActionError(null);
    setConflict(false);
    actionForm.resetFields();
    actionForm.setFieldsValue({ priority: topic.priority });
  };
  const apply = async (values: { priority: number; reason: string }) => {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    try {
      if (selected.action === "priority")
        await aiContentApi.priority(selected.topic, values.priority);
      else
        await aiContentApi.action(
          selected.topic,
          selected.action,
          values.reason,
        );
      setSelected(null);
      message.success("Topic updated.");
      reload();
    } catch (e) {
      setConflict(isApiError(e) && e.status === 409);
      setActionError(errorMessage(e));
      actionForm.setFields(
        Object.entries(fieldErrors(e) ?? {})
          .filter(([name]) => ["priority", "reason"].includes(name))
          .map(([name, errors]) => ({
            name: name as "priority" | "reason",
            errors,
          })),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        title={heading}
        description={heading === "Topic Queue" ? "Higher priority first; equal priorities keep creation order." : "Topics whose facts need a decision on the evidence."}
        crumbs={[{ label: "AI Content", href: "/ai-content" }]}
      />
      <AutomationNotice />
      {review && heading === "Topic Queue" && (
        <Card title={<h2 className="as-ai-card-heading">Topic ideas from public feeds</h2>} style={{ marginBottom: 20 }}>
          <Typography.Paragraph>Reads the configured feeds for recent, in-niche items. Ideas still need approval.</Typography.Paragraph>
          <Space wrap>
            <Button
              loading={discovering}
              onClick={async () => {
                setDiscovering(true);
                try {
                  const run = await aiContentApi.discover(crypto.randomUUID());
                  setDiscovery(`Discovery ${run.state.replaceAll("_", " ")}. Refresh the queue after it finishes to see new ideas.`);
                } catch (error) {
                  setDiscovery(isApiError(error) ? error.userMessage : "Discovery could not start.");
                } finally {
                  setDiscovering(false);
                }
              }}
            >
              Find topic ideas
            </Button>
            {discovery && <Typography.Text role="status">{discovery}</Typography.Text>}
          </Space>
        </Card>
      )}
      {manage && heading === "Topic Queue" && (
        <Collapse style={{ marginBottom: 20 }} items={[{ key: "create", label: "Add a manual topic", children: <div>
          {error && <ErrorState message={error} />}
          <Form
            name="ai-topic-create"
            form={createForm}
            disabled={saving}
            onValuesChange={() => setDirty(true)}
            layout="vertical"
            initialValues={{ priority: 0 }}
            onFinish={(v) => void create(v)}
          >
            <Form.Item
              name="title"
              label="Title / topic"
              rules={[{ required: true, whitespace: true, min: 3, max: 180 }]}
            >
              <Input placeholder={"e.g. A first-timer's guide to the East End"} maxLength={180} />
            </Form.Item>
            <Form.Item
              name="brief"
              label="Editorial brief (optional)"
              rules={[{ max: 2000 }]}
            >
              <Input.TextArea placeholder="Audience, angle and what the article must cover" rows={3} maxLength={2000} showCount />
            </Form.Item>
            <Form.Item
              name="priority"
              label="Priority (0–1000)"
              rules={[{ required: true, type: "integer", min: 0, max: 1000 }]}
            >
              <InputNumber placeholder="0" min={0} max={1000} />
            </Form.Item>
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={saving}>
                Create topic
              </Button>
              {error && (
                <Button
                  disabled={saving}
                  onClick={() =>
                    modal.confirm({
                      title: "Start a new submission?",
                      content:
                        "Your input will be kept. Check the queue first if the previous response was lost. Active-title duplicate protection still applies.",
                      onOk: () => {
                        requestKey.current = crypto.randomUUID();
                        setError(null);
                      },
                    })
                  }
                >
                  Start new request
                </Button>
              )}
            </Space>
          </Form>
        </div> }]} />
      )}
      <TableCard
        toolbar={
          <>
            <Select placeholder="All statuses"
              aria-label="Topic status"
              value={status ?? "all"}
              onChange={(v) => {
                setStatus(v === "all" ? undefined : (v as TopicStatus));
                setPage(1);
              }}
              options={[
                { value: "all", label: "All statuses" },
                ...TOPIC_STATUSES.map((value) => ({
                  value,
                  label: TOPIC_STATUS_LABELS[value],
                })),
              ]}
              style={{ width: 180 }}
            />
            <Input.Search
              aria-label="Search topics"
              placeholder="Search titles"
              maxLength={100}
              onSearch={(v) => {
                setQ(v);
                setPage(1);
              }}
              allowClear
            />
            <Button onClick={reload}>Refresh queue</Button>
          </>
        }
      >
        {state.status === "error" ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <Table<AiTopic>
            rowKey="id"
            loading={state.status === "loading"}
            dataSource={state.status === "ready" ? state.data.data : []}
            scroll={{ x: 700 }}
            locale={{ emptyText: "No topics match this view." }}
            pagination={{
              current: page,
              pageSize,
              total: state.status === "ready" ? state.data.meta.total : 0,
              pageSizeOptions: [10, 20, 50],
              showSizeChanger: true,
              onChange: (p, size) => {
                setPage(size !== pageSize ? 1 : p);
                setPageSize(size);
              },
            }}
            columns={[
              {
                title: "Topic",
                dataIndex: "title",
                render: (_, row) => (
                  <Link to={`/ai-content/topics/${row.id}`}>{row.title}</Link>
                ),
              },
              {
                title: "Status",
                dataIndex: "status",
                render: (value: TopicStatus) => <StatusTag status={value} label={TOPIC_STATUS_LABELS[value]} />,
              },
              { title: "Priority", dataIndex: "priority" },
              {
                title: "Actions",
                render: (_, row) =>
                  manage && ["queued", "paused"].includes(row.status) ? (
                    <Space wrap>
                      <Button
                        size="small"
                        onClick={() => openAction(row, "priority")}
                      >
                        Change priority
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          openAction(
                            row,
                            row.status === "queued" ? "pause" : "resume",
                          )
                        }
                      >
                        {row.status === "queued" ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => openAction(row, "cancel")}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => openAction(row, "reject")}
                      >
                        Reject
                      </Button>
                    </Space>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </TableCard>
      <Modal
        open={Boolean(selected)}
        title={
          selected
            ? `${{ priority: "Change priority", pause: "Pause", resume: "Resume", cancel: "Cancel", reject: "Reject" }[selected.action]} topic`
            : "Topic action"
        }
        onCancel={() => !saving && setSelected(null)}
        footer={null}
        forceRender
      >
        {selected && (
          <Typography.Paragraph>
            {selected.topic.title} · version {selected.topic.version} ·{" "}
            {TOPIC_STATUS_LABELS[selected.topic.status]}
          </Typography.Paragraph>
        )}
        {actionError && <ErrorState message={actionError} />}
        {conflict && (
          <Button
            onClick={async () => {
              if (!selected) return;
              try {
                const topic = await aiContentApi.detail(selected.topic.id);
                setSelected({ ...selected, topic });
                setConflict(false);
                setActionError(
                  "Latest version loaded. Your input is kept; review the status before applying.",
                );
                reload();
              } catch (e) {
                setActionError(errorMessage(e));
              }
            }}
          >
            Load latest version (keep input)
          </Button>
        )}
        <Form
          name="ai-topic-action"
          form={actionForm}
          disabled={saving}
          layout="vertical"
          onFinish={(v) => void apply(v)}
        >
          {selected?.action === "priority" && (
            <Form.Item
              name="priority"
              label="New priority"
              rules={[{ required: true, type: "integer", min: 0, max: 1000 }]}
            >
              <InputNumber placeholder="0–1000" min={0} max={1000} />
            </Form.Item>
          )}
          {(selected?.action === "cancel" || selected?.action === "reject") && (
            <Form.Item
              name="reason"
              label="Reason"
              rules={[{ required: true, whitespace: true, max: 500 }]}
            >
              <Input.TextArea placeholder="Why this change is needed" rows={3} maxLength={500} />
            </Form.Item>
          )}
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            disabled={conflict}
          >
            {selected ? { priority: "Save priority", pause: "Pause topic", resume: "Resume topic", cancel: "Cancel topic", reject: "Reject topic" }[selected.action] : "Save change"}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
