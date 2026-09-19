import { useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import { Link } from "react-router";
import {
  CLAIM_KINDS,
  SOURCE_TIER_LABELS,
  aiContentApi,
  type AiTopic,
  type Claim,
  type Evidence,
  type ResearchUrl,
  type SourceTier,
} from "@/api/ai-content";
import { isApiError } from "@/api/errors";
import { ErrorState, PageLoader, StatusTag } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";

const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
const words = (value: string) => value.replace(/_/g, " ");
const PACKET_LABELS = { collecting: "Collecting evidence", verified: "Verified", needs_fact_review: "Needs fact review", failed: "Research failed" } as const;
const TIER_OPTIONS = (Object.keys(SOURCE_TIER_LABELS) as SourceTier[]).filter((t) => t !== "unclassified").map((value) => ({ value, label: SOURCE_TIER_LABELS[value] }));

/** Local novelty: which existing articles, topics or rejected ideas this topic overlaps (SRS §7, §17). */
export function NoveltyCard({ topic, canReview, onChange }: { topic: AiTopic; canReview: boolean; onChange: (t: AiTopic) => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const matches = topic.noveltyDetail ?? [];
  return (
    <Card title={<h2 className="as-ai-card-heading">Overlap with existing content</h2>} style={{ marginTop: 16 }}>
      <Typography.Paragraph>
        Result: <strong>{topic.noveltyStatus === "unchecked" ? "Not checked" : words(topic.noveltyStatus)}</strong>
        {topic.noveltyCheckedAt ? ` (checked ${when(topic.noveltyCheckedAt)})` : ""}. Compared locally with articles, including drafts, topics and rejected ideas.
      </Typography.Paragraph>
      {matches.length > 0 && (
        <Table
          size="small"
          rowKey={(m) => `${m.kind}-${m.id}`}
          pagination={false}
          dataSource={matches}
          scroll={{ x: true }}
          columns={[
            { title: "Existing", dataIndex: "title", render: (title: string, m) => (m.kind === "post" ? <Link to={`/posts/${m.id}`}>{title}</Link> : <Link to={`/ai-content/topics/${m.id}`}>{title}</Link>) },
            { title: "Type", render: (_: unknown, m) => `${m.kind === "post" ? "Article" : "Topic"}, ${words(m.status)}` },
            { title: "Why", render: (_: unknown, m) => words(m.reason) },
            { title: "Verdict", dataIndex: "verdict", render: (v: string) => <StatusTag status={v} /> },
          ]}
        />
      )}
      {canReview && (
        <Button
          style={{ marginTop: 12 }}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onChange(await aiContentApi.checkNovelty(topic.id));
            } catch (error) {
              message.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          Check again
        </Button>
      )}
    </Card>
  );
}

/** The public pages research may read for this topic (≤10 https URLs). */
export function SourcesCard({ topic, canReview, onChange }: { topic: AiTopic; canReview: boolean; onChange: (t: AiTopic) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ sources: ResearchUrl[] }>();
  const [saving, setSaving] = useState(false);
  const editable = canReview && ["queued", "paused", "failed", "researching", "needs_fact_review"].includes(topic.status);
  return (
    <Card title={<h2 className="as-ai-card-heading">Research sources</h2>} style={{ marginTop: 16 }}>
      <Typography.Paragraph type="secondary">Public https pages only. Official pages establish first-party facts.</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ sources: topic.researchUrls ?? [] }}
        disabled={!editable || saving}
        onFinish={async (values) => {
          setSaving(true);
          try {
            const updated = await aiContentApi.setSources(topic, (values.sources ?? []).filter((s) => s?.url?.trim()).map((s) => ({ url: s.url.trim(), tier: s.tier ?? null })));
            onChange(updated);
            message.success("Sources saved");
          } catch (error) {
            const fields = fieldErrors(error);
            form.setFields(Object.entries(fields).map(([name, errors]) => ({ name: name.split("."), errors })) as never);
            message.error(errorMessage(error));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.List name="sources">
          {(items, { add, remove }) => (
            <>
              {items.map((item, index) => (
                <Space key={item.key} align="start" wrap style={{ display: "flex" }}>
                  <Form.Item name={[item.name, "url"]} label={`Page ${index + 1}`} rules={[{ required: true, message: "Enter an https address" }]} style={{ minWidth: 260, flex: 1 }}>
                    <Input inputMode="url" maxLength={2000} placeholder="https://" />
                  </Form.Item>
                  <Form.Item name={[item.name, "tier"]} label="Source type">
                    <Select allowClear placeholder="From the registry" options={TIER_OPTIONS} style={{ width: 240 }} />
                  </Form.Item>
                  <Button aria-label={`Remove page ${index + 1}`} onClick={() => remove(item.name)} style={{ marginTop: 30 }}>
                    Remove
                  </Button>
                </Space>
              ))}
              {items.length < 10 && editable && <Button onClick={() => add({ url: "" })}>Add a page</Button>}
            </>
          )}
        </Form.List>
        {editable && (
          <Button type="primary" htmlType="submit" loading={saving} style={{ marginTop: 12 }}>
            Save sources
          </Button>
        )}
      </Form>
    </Card>
  );
}

function ClaimActions({ claim, onDone }: { claim: Claim; onDone: () => void }) {
  const { message, modal } = App.useApp();
  const act = async (action: "accept" | "exclude" | "reopen", note?: string) => {
    try {
      await aiContentApi.resolveClaim(claim, action, note);
      onDone();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };
  const ask = (title: string, action: "accept" | "exclude") => {
    let note = "";
    modal.confirm({
      title,
      content: (
        <Input.TextArea
          aria-label="Reason"
          maxLength={500}
          rows={3}
          placeholder={action === "exclude" ? "Why the article will not state this" : "Why this value is right, on its evidence"}
          onChange={(e) => (note = e.target.value)}
        />
      ),
      okText: action === "exclude" ? "Exclude" : "Accept",
      onOk: () => act(action, note.trim() || undefined),
    });
  };
  if (claim.excluded || claim.accepted) return <Button size="small" onClick={() => act("reopen")}>Reopen</Button>;
  return (
    <Space wrap>
      {(claim.status === "conflicting" || claim.status === "unresolved") && claim.sources.length > 0 && (
        <Button size="small" onClick={() => ask("Accept this value on its evidence?", "accept")}>Accept</Button>
      )}
      <Button size="small" onClick={() => ask("Exclude this claim from the article?", "exclude")}>Exclude</Button>
    </Space>
  );
}

function AddClaim({ packetId, evidence, onDone }: { packetId: string; evidence: Evidence[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const usable = evidence.filter((e) => e.fetchStatus === "ok");
  if (usable.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add a claim from evidence</Button>
      <Modal
        open={open}
        title="Add an evidence-backed claim"
        okText="Add claim"
        confirmLoading={saving}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ material: true, evidenceId: usable[0]!.id }}
          onFinish={async (values) => {
            setSaving(true);
            try {
              await aiContentApi.addClaim(packetId, values);
              setOpen(false);
              form.resetFields();
              onDone();
            } catch (error) {
              form.setFields(Object.entries(fieldErrors(error)).map(([name, errors]) => ({ name, errors })) as never);
              if (!isApiError(error) || Object.keys(fieldErrors(error)).length === 0) form.setFields([{ name: "excerpt", errors: [errorMessage(error)] }]);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item name="evidenceId" label="Evidence" rules={[{ required: true }]}>
            <Select placeholder="Choose the retrieved page" options={usable.map((e) => ({ value: e.id, label: `${e.host}: ${e.title ?? e.url}` }))} />
          </Form.Item>
          <Form.Item name="kind" label="Type of fact" rules={[{ required: true, message: "Choose a type" }]}>
            <Select placeholder="Choose the type of fact" options={CLAIM_KINDS.map((k) => ({ value: k, label: words(k) }))} />
          </Form.Item>
          <Form.Item name="subject" label="About (place, business or event)" rules={[{ required: true, message: "Enter what this is about" }]}>
            <Input placeholder="e.g. Adelaide Central Market" maxLength={200} />
          </Form.Item>
          <Form.Item name="value" label="Value, exactly as the source states it" rules={[{ required: true, message: "Enter the value" }]}>
            <Input placeholder="Exactly as the source states it" maxLength={1000} />
          </Form.Item>
          <Form.Item name="excerpt" label="Excerpt copied from the source" extra="It must appear in the retrieved text and state the value." rules={[{ required: true, message: "Paste the supporting text" }]}>
            <Input.TextArea placeholder="Paste the exact words from the page" rows={3} maxLength={1000} />
          </Form.Item>
          <Form.Item name="material" valuePropName="checked">
            <Checkbox>The article will state this as fact</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/**
 * Topic approval, the verified research packet and first-class fact review
 * (SRS §9, §14). Every decision goes to the server, which applies the policy.
 */
export function ResearchCard({ topic, canReview, onChange }: { topic: AiTopic; canReview: boolean; onChange: (t: AiTopic) => void }) {
  const { message } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.research(topic.id), [topic.id, topic.version]);
  const [busy, setBusy] = useState(false);
  const [followUpPostId, setFollowUpPostId] = useState<string>();
  const [followUpReason, setFollowUpReason] = useState("");
  const [problem, setProblem] = useState<string[] | null>(null);
  const postMatches = (topic.noveltyDetail ?? []).filter((m) => m.kind === "post");
  // A topic that overlaps only topics a person cancelled may be approved as their correction, with a reason.
  const cancelledOnly = (topic.noveltyDetail ?? []).length > 0 && (topic.noveltyDetail ?? []).every((m) => m.kind === "item" && m.status === "cancelled");
  const [correctionReason, setCorrectionReason] = useState("");
  const canApprove = canReview && (topic.status === "queued" || topic.status === "failed");
  const waitingForSlot = topic.status === "queued" && Boolean(topic.awaitingSlotSince);
  const packet = state.status === "ready" ? state.data.packet : null;
  const canRefresh = canReview && (topic.status === "researching" || topic.status === "needs_fact_review") && packet?.status !== "collecting";

  const run = async (action: "approve" | "approve_for_slot" | "refresh") => {
    setBusy(true);
    setProblem(null);
    try {
      const followUp =
        action === "refresh" ? undefined : followUpPostId ? { followUpOfPostId: followUpPostId, followUpReason } : correctionReason.trim() ? { correctionReason: correctionReason.trim() } : undefined;
      onChange(await aiContentApi.researchAction(topic, action, followUp));
      message.success(action === "approve" ? "Approved for research" : action === "approve_for_slot" ? "Approved for the daily slot" : "Research refreshed");
    } catch (error) {
      const fields = fieldErrors(error);
      setProblem([errorMessage(error), ...(fields.novelty ?? []), ...Object.entries(fields).filter(([k]) => k !== "novelty").flatMap(([, v]) => v)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<h2 className="as-ai-card-heading">Research and fact review</h2>} style={{ marginTop: 16 }}>
      {problem && <Alert type="error" showIcon message={problem[0]} description={problem.slice(1).map((p) => <div key={p}>{p}</div>)} style={{ marginBottom: 12 }} role="alert" />}
      {canApprove && (
        <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
          {topic.noveltyStatus === "review" && postMatches.length > 0 && (
            <>
              <Typography.Text>This topic overlaps an article. Approve it only as a justified follow-up.</Typography.Text>
              <Select
                aria-label="Article this topic follows up"
                allowClear
                placeholder="Follow-up of…"
                value={followUpPostId}
                onChange={setFollowUpPostId}
                options={postMatches.map((m) => ({ value: m.id, label: m.title }))}
                style={{ maxWidth: 420 }}
              />
              {followUpPostId && <Input.TextArea aria-label="Why this follow-up is a different, useful article" rows={2} maxLength={500} value={followUpReason} onChange={(e) => setFollowUpReason(e.target.value)} placeholder="Why this is a different, useful article" />}
            </>
          )}
          {topic.noveltyStatus === "review" && cancelledOnly && (
            <>
              <Typography.Text>This topic overlaps only a cancelled topic. Approve it as that topic's correction.</Typography.Text>
              <Input.TextArea
                aria-label="What was wrong with the cancelled topic"
                rows={2}
                maxLength={400}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="What was wrong with the cancelled topic"
              />
            </>
          )}
          {waitingForSlot && <Alert type="info" showIcon message="Waiting for the daily slot. Its research starts when a slot takes it." />}
          <Space wrap>
            <Button type="primary" loading={busy} onClick={() => run("approve")}>
              Approve topic for research now
            </Button>
            {topic.status === "queued" && !waitingForSlot && (
              <Button loading={busy} onClick={() => run("approve_for_slot")}>
                Approve for the daily slot
              </Button>
            )}
          </Space>
        </Space>
      )}
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : !packet ? (
        <Typography.Paragraph>No research yet. Approve the topic to retrieve its sources.</Typography.Paragraph>
      ) : (
        <>
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: "packet", label: "Packet", children: `Version ${packet.version}: ${PACKET_LABELS[packet.status]}` },
              { key: "fresh", label: "Facts current until", children: when(packet.freshUntil) },
              ...(packet.reasons?.length ? [{ key: "why", label: "Needs attention", children: packet.reasons.join(". ") }] : []),
              ...(packet.changes?.length ? [{ key: "changes", label: "Changed since last verified", children: packet.changes.map((c) => `${words(c.kind)} of ${c.subject}: ${c.value}`).join("; ") }] : []),
              ...(packet.context?.length ? [{ key: "context", label: "Related published articles", children: packet.context.map((c) => c.title).join("; ") }] : []),
            ]}
          />
          {canRefresh && (
            <Space style={{ margin: "12px 0" }} wrap>
              <Button loading={busy} onClick={() => run("refresh")}>Refresh evidence</Button>
              {canReview && <AddClaim packetId={packet.id} evidence={packet.evidence} onDone={() => { reload(); void aiContentApi.detail(topic.id).then(onChange); }} />}
            </Space>
          )}
          <Typography.Title level={3} style={{ fontSize: 16 }}>Claims</Typography.Title>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: true }}
            dataSource={packet.claims}
            locale={{ emptyText: "No claims found on the retrieved pages" }}
            columns={[
              { title: "Fact", render: (_: unknown, c: Claim) => <><strong>{words(c.kind)}</strong> of {c.subject}{c.material ? "" : " (minor)"}</> },
              { title: "Value", dataIndex: "value" },
              { title: "Status", render: (_: unknown, c: Claim) => <><StatusTag status={c.status} /><div><Typography.Text type="secondary">{c.reason}</Typography.Text></div></> },
              { title: "Evidence", render: (_: unknown, c: Claim) => c.sources.map((s) => <div key={s.evidenceId}><Typography.Text code>{s.excerpt}</Typography.Text></div>) },
              ...(canReview ? [{ title: "Decision", render: (_: unknown, c: Claim) => <ClaimActions claim={c} onDone={() => { reload(); void aiContentApi.detail(topic.id).then(onChange); }} /> }] : []),
            ]}
          />
          <Typography.Title level={3} style={{ fontSize: 16, marginTop: 16 }}>Evidence</Typography.Title>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: true }}
            dataSource={packet.evidence}
            columns={[
              { title: "Page", render: (_: unknown, e: Evidence) => <a href={e.finalUrl ?? e.url} target="_blank" rel="noopener noreferrer nofollow">{e.title ?? e.url}</a> },
              { title: "Source type", render: (_: unknown, e: Evidence) => SOURCE_TIER_LABELS[e.tier] },
              { title: "Retrieval", render: (_: unknown, e: Evidence) => `${words(e.fetchStatus)}${e.httpStatus ? ` (${e.httpStatus})` : ""}` },
              { title: "Retrieved (Adelaide time)", render: (_: unknown, e: Evidence) => when(e.fetchedAt) },
              { title: "Source date", render: (_: unknown, e: Evidence) => when(e.sourceDate) },
            ]}
          />
        </>
      )}
    </Card>
  );
}
