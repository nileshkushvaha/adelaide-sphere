import { useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
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
import { Link, useParams } from "react-router";
import {
  aiContentApi,
  type AiTopic,
  type TopicInput,
  type TopicStatus,
  TOPIC_STATUSES,
  TOPIC_STATUS_LABELS,
} from "@/api/ai-content";
import { isApiError } from "@/api/errors";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import { ErrorState, PageHeader, PageLoader, TableCard } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useUnsavedChanges } from "@/shared/useUnsavedChanges";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { NoveltyCard, ResearchCard, SourcesCard } from "./ResearchPanels";

export function AutomationNotice() {
  return (
    <Alert
      type="info"
      showIcon
      message="Research only: no article generation"
      description="While enabled, approved topics are checked against free public pages. No provider is paid."
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
        description="Topics, free public research and fact review."
      />
      <AutomationNotice />
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <Card>
          <Typography.Paragraph>
            Automation configured:{" "}
            <strong>{state.data.enabled ? "Enabled" : "Disabled"}</strong>.
            Research: <strong>{state.data.executionActive ? "Active" : "Inactive"}</strong>. Article generation:{" "}
            <strong>Not available</strong>.
          </Typography.Paragraph>
          <Descriptions
            items={TOPIC_STATUSES.map((key) => ({
              key,
              label: TOPIC_STATUS_LABELS[key],
              children: state.data.counts[key] ?? 0,
            }))}
          />
        </Card>
      )}
      <Space wrap style={{ marginTop: 16 }}>
        <Link to="/ai-content/topics">Topic Queue</Link>
        {can(PERMISSION.aiContentConfigure) && (
          <Link to="/ai-content/settings">AI Settings</Link>
        )}
      </Space>
    </>
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
        title="Topic detail"
        crumbs={[{ label: "Topic Queue", href: "/ai-content/topics" }]}
      />
      <AutomationNotice />
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <Card>
          <Typography.Title level={2}>{state.data.title}</Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
            {state.data.brief || "No editorial brief."}
          </Typography.Paragraph>
          <Descriptions
            column={1}
            items={[
              {
                key: "status",
                label: "Status",
                children: TOPIC_STATUS_LABELS[state.data.status],
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
              { key: "source", label: "Source", children: state.data.source },
              ...(state.data.selectionReason ? [{ key: "why", label: "Why selected", children: state.data.selectionReason }] : []),
              ...(state.data.followUpReason ? [{ key: "followup", label: "Follow-up justification", children: state.data.followUpReason }] : []),
              {
                key: "creator",
                label: "Created by administrator ID",
                children:
                  state.data.createdByAdminId ?? "Removed administrator",
              },
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
          <NoveltyCard topic={state.data} canReview={canReview} onChange={() => reload()} />
          <SourcesCard key={`${state.data.id}-${state.data.version}`} topic={state.data} canReview={canReview} onChange={() => reload()} />
          <ResearchCard topic={state.data} canReview={canReview} onChange={() => reload()} />
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
  const [status, setStatus] = useState<TopicStatus | undefined>(initialStatus);
  const review = can(PERMISSION.aiContentReview);
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
        <Card title="Topic ideas from public feeds" style={{ marginBottom: 20 }}>
          <Typography.Paragraph>Reads the configured feeds for recent, in-niche items. Ideas still need approval.</Typography.Paragraph>
          <Space wrap>
            <Button
              onClick={async () => {
                try {
                  const run = await aiContentApi.discover(crypto.randomUUID());
                  setDiscovery(`Discovery requested (${run.state}). New ideas appear in the queue when it finishes.`);
                } catch (error) {
                  setDiscovery(isApiError(error) ? error.userMessage : "Discovery could not start.");
                }
              }}
            >
              Find topic ideas
            </Button>
            {discovery && <Typography.Text role="status">{discovery}</Typography.Text>}
          </Space>
        </Card>
      )}
      {manage && (
        <Card title="Add manual topic" style={{ marginBottom: 20 }}>
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
              <Input maxLength={180} />
            </Form.Item>
            <Form.Item
              name="brief"
              label="Editorial brief (optional)"
              rules={[{ max: 2000 }]}
            >
              <Input.TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
            <Form.Item
              name="priority"
              label="Priority (0–1000)"
              rules={[{ required: true, type: "integer", min: 0, max: 1000 }]}
            >
              <InputNumber min={0} max={1000} />
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
        </Card>
      )}
      <TableCard
        toolbar={
          <>
            <Select
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
                render: (value: TopicStatus) => TOPIC_STATUS_LABELS[value],
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
                        Reprioritize
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
            ? `${selected.action === "priority" ? "Reprioritize" : selected.action} topic`
            : "Topic action"
        }
        onCancel={() => !saving && setSelected(null)}
        footer={null}
        forceRender
      >
        {selected && (
          <Typography.Paragraph>
            {selected.topic.title} · version {selected.topic.version} ·{" "}
            {selected.topic.status}
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
              <InputNumber min={0} max={1000} />
            </Form.Item>
          )}
          {(selected?.action === "cancel" || selected?.action === "reject") && (
            <Form.Item
              name="reason"
              label="Reason"
              rules={[{ required: true, whitespace: true, max: 500 }]}
            >
              <Input.TextArea rows={3} maxLength={500} />
            </Form.Item>
          )}
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
            disabled={conflict}
          >
            Confirm change
          </Button>
        </Form>
      </Modal>
    </>
  );
}
