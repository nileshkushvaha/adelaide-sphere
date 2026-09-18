import { useRef, useState } from "react";
import { Alert, App, Button, Card, Descriptions, Input, Select, Space, Table, Tag, Typography } from "antd";
import { Link } from "react-router";
import {
  aiContentApi,
  money,
  type AiTopic,
  type BudgetStatus,
  type GenerationOperation,
  type GenerationRun,
} from "@/api/ai-content";
import { blogApi } from "@/api/blog";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import { ErrorState, PageLoader } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";

const when = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const words = (value: string | null) => (value ?? "").replace(/_/g, " ");

/** Server refusals shown as the server phrased them, including every unsupported fact it listed. */
function Problem({ error }: { error: unknown }) {
  const fields = fieldErrors(error);
  const lines = [...(fields.facts ?? []), ...Object.entries(fields).filter(([k]) => k !== "facts").flatMap(([, v]) => v)];
  return <Alert type="error" showIcon role="alert" message={errorMessage(error)} description={lines.length ? lines.map((l) => <div key={l}>{l}</div>) : undefined} style={{ marginBottom: 12 }} />;
}

/**
 * The article for a topic (AI SRS §13–14): its category, budgeted generation
 * from verified research, fact re-check and human approval. Approval is bound
 * server-side to the exact article version shown here and the current research.
 */
export function ArticleCard({ topic, onChange }: { topic: AiTopic; onChange: () => void }) {
  const { can } = useCapabilities();
  const { message } = App.useApp();
  const [categories] = useAsync((signal) => blogApi().listTerms("blog-categories", { status: "active" }, signal), []);
  const [history, reloadHistory] = useAsync(() => aiContentApi.generation(topic.id), [topic.id, topic.version]);
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // One key per intended generation: a retry after a lost response is the same request, not a second charge.
  const requestKey = useRef<string>(crypto.randomUUID());
  const act = async (work: () => Promise<unknown>, done: string, newKey = false) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      message.success(done);
      if (newKey) requestKey.current = crypto.randomUUID();
      onChange();
      reloadHistory();
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(false);
    }
  };
  const post = history.status === "ready" ? history.data.post : null;
  const editable = !["published", "cancelled", "rejected", "scheduled", "approved"].includes(topic.status);
  return (
    <Card title="Article" style={{ marginTop: 16 }}>
      {Boolean(problem) && <Problem error={problem} />}
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap align="center">
          <Typography.Text id="ai-category-label">Category</Typography.Text>
          <Select
            aria-labelledby="ai-category-label"
            allowClear
            placeholder="Choose an existing category"
            disabled={!can(PERMISSION.aiContentReview) || !editable || busy}
            value={topic.categoryId ?? undefined}
            loading={categories.status === "loading"}
            options={categories.status === "ready" ? categories.data.map((c) => ({ value: c.id, label: c.name })) : []}
            onChange={(value) => void act(() => aiContentApi.setArticleSettings(topic, value ?? null), "Category saved")}
            style={{ minWidth: 240 }}
          />
        </Space>
        {can(PERMISSION.aiContentGenerate) && (
          <Space wrap>
            {(topic.status === "researching" || topic.status === "ready_for_review") && (
              <Button type="primary" loading={busy} onClick={() => void act(() => aiContentApi.generate(topic, "full", requestKey.current), "Draft requested", true)}>
                {topic.postId ? "Regenerate draft" : "Generate draft"}
              </Button>
            )}
            {topic.status === "ready_for_review" && topic.postId && (
              <Button loading={busy} onClick={() => void act(() => aiContentApi.generate(topic, "metadata", requestKey.current), "Suggestions requested", true)}>
                Suggest title and SEO
              </Button>
            )}
          </Space>
        )}
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Each request reserves its worst-case cost first. A regenerated draft never replaces a person&apos;s edits: it is kept as a proposal.
        </Typography.Paragraph>
        {post && (
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: "post", label: "Draft", children: <Link to={`/posts/${post.id}`}>{post.title}</Link> },
              { key: "version", label: "Article version", children: post.version },
              { key: "status", label: "Article status", children: words(post.status) },
            ]}
          />
        )}
        {post && (topic.status === "needs_fact_review" || topic.status === "ready_for_review") && can(PERMISSION.aiContentReview) && (
          <Button loading={busy} onClick={() => void act(() => aiContentApi.recheckFacts(topic), "Facts re-checked")}>
            Re-check facts against research
          </Button>
        )}
        {post && topic.status === "ready_for_review" && can(PERMISSION.aiContentApprove) && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input.TextArea aria-label="Approval note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked (optional)" />
            <Button type="primary" loading={busy} onClick={() => void act(() => aiContentApi.approve(topic, post.version, note.trim() || undefined), "Approved. Publish it from the article when ready.")}>
              Approve version {post.version}
            </Button>
          </Space>
        )}
      </Space>
      {history.status === "loading" ? <PageLoader /> : history.status === "error" ? <ErrorState message={history.message} onRetry={reloadHistory} /> : <History data={history.data} topic={topic} onChange={() => { onChange(); reloadHistory(); }} />}
    </Card>
  );
}

function History({ data, topic, onChange }: { data: Awaited<ReturnType<typeof aiContentApi.generation>>; topic: AiTopic; onChange: () => void }) {
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const current = data.post;
  const resolve = (op: GenerationOperation, action: "reconcile" | "abandon") => {
    let note = "";
    modal.confirm({
      title: action === "abandon" ? "Abandon this request and count its full reservation as spent?" : "Look the result up again by its provider id?",
      content: <Input.TextArea aria-label="What you checked" rows={3} maxLength={500} onChange={(e) => (note = e.target.value)} />,
      okText: action === "abandon" ? "Abandon" : "Look up again",
      onOk: async () => {
        try {
          await aiContentApi.resolveOperation(op.id, action, note);
          onChange();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };
  const apply = async (run: GenerationRun) => {
    if (!current) return;
    try {
      await aiContentApi.applyProposal(run.id, current.version);
      message.success("Proposal applied");
      onChange();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };
  const proposals = data.runs.filter((r) => r.status === "proposal");
  const latest = data.runs.find((r) => r.status === "applied");
  return (
    <>
      {data.operations.some((o) => o.state === "outcome_unknown") && (
        <Alert type="warning" showIcon style={{ marginTop: 16 }} message="A generation's outcome is unknown" description="The request may have run and been charged. It is never sent again automatically; resolve it below." />
      )}
      {latest?.coverage && latest.coverage.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="Facts not supported by verified research"
          description={latest.coverage.slice(0, 20).map((v, i) => <div key={`${v.field}-${i}`}>{`${v.field}: "${v.token}" (${words(v.reason)})`}</div>)}
        />
      )}
      {proposals.map((run) => {
        const a = run.artifact as Record<string, unknown>;
        const rows = [
          ["Title", current?.title, a.title],
          ["Summary", current?.excerpt, a.excerpt],
          ["SEO title", current?.seoTitle, a.seoTitle],
          ["SEO description", current?.seoDescription, a.seoDescription],
        ].filter(([, , next]) => typeof next === "string");
        return (
          <Card key={run.id} size="small" title={`Proposal ${run.generationVersion}: ${words(run.proposalReason)}`} style={{ marginTop: 16 }}>
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => String(r[0])}
              dataSource={rows}
              scroll={{ x: true }}
              columns={[
                { title: "Field", render: (_: unknown, r) => r[0] as string },
                { title: "Now", render: (_: unknown, r) => String(r[1] ?? "") },
                { title: "Proposed", render: (_: unknown, r) => String(r[2] ?? "") },
              ]}
            />
            {run.scope === "full" && <Typography.Paragraph type="secondary">The proposed body replaces the current body; the current one is kept as a revision.</Typography.Paragraph>}
            {can(PERMISSION.aiContentGenerate) && can(PERMISSION.postsUpdate) && current && ["ready_for_review", "needs_fact_review"].includes(topic.status) && (
              <Button onClick={() => void apply(run)}>Apply to version {current.version}</Button>
            )}
          </Card>
        );
      })}
      {latest?.imageBriefs && latest.imageBriefs.length > 0 && (
        <Card size="small" title="Image briefs (for a person to source or create)" style={{ marginTop: 16 }}>
          {latest.imageBriefs.map((b, i) => (
            <Descriptions key={i} size="small" column={1} items={[{ key: "p", label: `${b.placement} (${b.aspectRatio})`, children: b.prompt }, { key: "a", label: "Draft alt text", children: b.altDraft }]} />
          ))}
        </Card>
      )}
      <Typography.Title level={3} style={{ fontSize: 16, marginTop: 16 }}>
        Runs and cost
      </Typography.Title>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ x: true }}
        dataSource={data.operations}
        locale={{ emptyText: "Nothing generated yet" }}
        columns={[
          { title: "When", render: (_: unknown, o: GenerationOperation) => when(o.createdAt) },
          { title: "What", render: (_: unknown, o: GenerationOperation) => `${o.kind === "apply" ? "Apply to article" : `Generate (${o.scope})`}${o.model ? ` · ${o.model}` : ""}` },
          { title: "State", render: (_: unknown, o: GenerationOperation) => <><Tag color={o.state === "outcome_unknown" ? "orange" : o.state === "failed" ? "red" : o.state === "succeeded" ? "green" : "default"}>{words(o.state)}</Tag><div><Typography.Text type="secondary">{words(o.resultCode ?? o.errorClass)}</Typography.Text></div></> },
          { title: "Cost", render: (_: unknown, o: GenerationOperation) => (o.kind === "apply" ? "—" : <>{`${words(o.costState)}: ${o.costState === "reserved" ? money(o.reservedMicros, o.priceSchedule?.currency) : money(o.settledMicros, o.priceSchedule?.currency)}`}<div><Typography.Text type="secondary">{`max ${money(o.estimatedMaxMicros, o.priceSchedule?.currency)}${o.priceSchedule ? ` · ${o.priceSchedule.version}` : ""}`}</Typography.Text></div></>) },
          { title: "Tokens", render: (_: unknown, o: GenerationOperation) => (o.inputTokens === null ? "—" : `${o.inputTokens} in (${o.cachedInputTokens ?? 0} cached) · ${o.outputTokens} out (${o.reasoningTokens ?? 0} reasoning)`) },
          ...(can(PERMISSION.aiContentConfigure)
            ? [{ title: "Resolve", render: (_: unknown, o: GenerationOperation) => (o.state === "outcome_unknown" ? <Space wrap>{o.providerPhase === "sent" && <Button size="small" onClick={() => resolve(o, "reconcile")}>Look up</Button>}<Button size="small" danger onClick={() => resolve(o, "abandon")}>Abandon</Button></Space> : null) }]
            : []),
        ]}
      />
      {data.runs.length > 0 && (
        <Descriptions
          size="small"
          column={1}
          style={{ marginTop: 12 }}
          items={data.runs.slice(0, 1).map((r) => ({ key: r.id, label: `Latest run ${r.generationVersion}`, children: `${r.provider ?? ""} ${r.model ?? ""} · ${r.promptVersion ?? ""} · ${r.schemaVersion ?? ""} · research ${r.researchPacketId ?? "—"} · facts ${r.factCheck}` }))}
        />
      )}
    </>
  );
}

/** Spend against the owner's caps, with any halt and how to lift it after reconciling (plan §I). */
export function BudgetCard() {
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.budget(), []);
  if (state.status === "loading") return <PageLoader />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  const b: BudgetStatus = state.data;
  const line = (p: BudgetStatus["day"]) => `${money(p.settledMicros, b.currency)} spent + ${money(p.reservedMicros, b.currency)} reserved of ${money(p.limitMicros, b.currency)}`;
  return (
    <Card title="AI budget" style={{ marginTop: 16 }}>
      {b.paidCallsHaltedAt && (
        <Alert
          type="error"
          showIcon
          role="alert"
          style={{ marginBottom: 12 }}
          message="Paid calls are halted"
          description={b.paidHaltReason}
          action={
            can(PERMISSION.aiContentConfigure) ? (
              <Button
                size="small"
                onClick={() => {
                  let note = "";
                  modal.confirm({
                    title: "Resume paid calls?",
                    content: <Input.TextArea aria-label="How it was reconciled" rows={3} maxLength={500} onChange={(e) => (note = e.target.value)} />,
                    onOk: async () => {
                      try {
                        await aiContentApi.resumePaidCalls(note);
                        reload();
                      } catch (error) {
                        message.error(errorMessage(error));
                      }
                    },
                  });
                }}
              >
                Resume after reconciling
              </Button>
            ) : undefined
          }
        />
      )}
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: "day", label: `Today (${b.day.period})`, children: <>{line(b.day)} {b.day.warning && <Tag color="orange">over {b.warningPercent}%</Tag>}</> },
          { key: "month", label: `This month (${b.month.period})`, children: <>{line(b.month)} {b.month.warning && <Tag color="orange">over {b.warningPercent}%</Tag>}</> },
          { key: "cap", label: "Per article", children: `at most ${money(b.workflowLimitMicros, b.currency)}` },
          { key: "uncertain", label: "Charged but not priceable", children: `${b.uncertainOperations} (${money(b.uncertainMicros, b.currency)}, counted in full)` },
          { key: "unknown", label: "Outcome unknown", children: b.outcomeUnknownOperations },
        ]}
      />
    </Card>
  );
}
