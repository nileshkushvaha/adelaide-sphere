import { useRef, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Descriptions, Empty, Input, Select, Space, Tag, Typography } from "antd";
import { Link } from "react-router";
import { aiContentApi, money, type AiTopic, type ImageJob, type TopicImages } from "@/api/ai-content";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import { ErrorState, PageLoader } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";

const STATUS_COLOR: Record<ImageJob["status"], string> = {
  requested: "blue",
  stored: "gold",
  approved: "green",
  rejected: "default",
  failed: "red",
  outcome_unknown: "volcano",
  superseded: "default",
};
const STATUS_LABEL: Record<ImageJob["status"], string> = {
  requested: "Being made",
  stored: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  outcome_unknown: "Outcome unknown",
  superseded: "Replaced",
};
const EDITABLE: AiTopic["status"][] = ["needs_fact_review", "ready_for_review", "approved"];

function Problem({ error }: { error: unknown }) {
  const lines = Object.values(fieldErrors(error)).flat();
  return <Alert type="error" showIcon role="alert" message={errorMessage(error)} description={lines.length ? lines.map((l) => <div key={l}>{l}</div>) : undefined} style={{ marginBottom: 12 }} />;
}

/**
 * The article's featured image (AI SRS §12; Phase 1E owner decisions): the
 * prompt-only brief, an explicit Generate image action in hybrid mode, and a
 * person's approval of the actual image with alt text written from it.
 * Nothing is attached automatically; the server enforces every rule shown here.
 */
export function FeaturedImageCard({ topic, onChange }: { topic: AiTopic; onChange: () => void }) {
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.images(topic.id), [topic.id, topic.version]);
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  // One key per intended image: a retry after a lost response is the same request, never a second charge.
  const requestKey = useRef<string>(crypto.randomUUID());
  const act = async (work: () => Promise<unknown>, done: string, newKey = false) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      message.success(done);
      if (newKey) requestKey.current = crypto.randomUUID();
      onChange();
      reload();
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(false);
    }
  };
  if (state.status === "loading") return <Card title="Featured image" style={{ marginTop: 16 }}><PageLoader /></Card>;
  if (state.status === "error") return <Card title="Featured image" style={{ marginTop: 16 }}><ErrorState message={state.message} onRetry={reload} /></Card>;
  const data: TopicImages = state.data;
  const mode = data.override ?? data.globalMode;
  const editable = EDITABLE.includes(topic.status) && Boolean(data.post);
  const text = prompt ?? data.brief?.prompt ?? "";
  const inFlight = data.jobs.some((j) => j.status === "requested" || j.status === "outcome_unknown");

  return (
    <Card title="Featured image" style={{ marginTop: 16 }}>
      {Boolean(problem) && <Problem error={problem} />}
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space wrap align="center">
          <Typography.Text id="ai-image-mode-label">Image mode</Typography.Text>
          <Select
            aria-labelledby="ai-image-mode-label"
            disabled={!can(PERMISSION.aiContentReview) || busy || ["published", "cancelled", "rejected", "scheduled", "approved"].includes(topic.status)}
            value={data.override ?? "default"}
            onChange={(value) => void act(() => aiContentApi.setArticleSettings(topic, { imageMode: value === "default" ? null : (value as "manual" | "hybrid") }), "Image mode saved")}
            options={[
              { value: "default", label: `Follow AI Settings (${data.globalMode})` },
              { value: "manual", label: "Manual: prompt only" },
              { value: "hybrid", label: "Hybrid: prompt, or generate on request" },
            ]}
            style={{ minWidth: 280 }}
          />
        </Space>
        {data.brief && (
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: "prompt", label: "Suggested prompt", children: data.brief.prompt },
              { key: "alt", label: "Alt draft (written before any image exists)", children: data.brief.altDraft || "—" },
            ]}
          />
        )}
        {mode === "manual" ? (
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Manual: create or choose an image, then upload it as the featured image
            {data.post ? (
              <>
                {" "}in the <Link to={`/posts/${data.post.id}`}>article editor</Link>
              </>
            ) : null}
            .
          </Typography.Paragraph>
        ) : (
          can(PERMISSION.aiContentGenerate) &&
          editable && (
            <Space direction="vertical" style={{ width: "100%" }}>
              <Input.TextArea aria-label="Image prompt" rows={3} maxLength={1000} value={text} onChange={(e) => setPrompt(e.target.value)} placeholder="A generic scene. Do not name places, businesses or events." />
              <Button
                type="primary"
                loading={busy}
                disabled={inFlight || !text.trim()}
                onClick={() =>
                  modal.confirm({
                    title: "Generate a featured image?",
                    content: `One ${data.size} image at ${data.quality} quality. Its maximum cost is reserved from the image budget first.`,
                    okText: "Generate image",
                    onOk: () => act(() => aiContentApi.generateImage(topic, requestKey.current, prompt ?? undefined), "Image requested", true),
                  })
                }
              >
                {data.jobs.length > 0 ? "Generate a new image" : "Generate image"}
              </Button>
            </Space>
          )
        )}
        {data.jobs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No image generated" />
        ) : (
          data.jobs.map((job) => <ImageJobRow key={job.id} job={job} data={data} topic={topic} busy={busy} act={act} />)
        )}
      </Space>
    </Card>
  );
}

function ImageJobRow({ job, data, topic, busy, act }: { job: ImageJob; data: TopicImages; topic: AiTopic; busy: boolean; act: (work: () => Promise<unknown>, done: string) => Promise<void> }) {
  const { can } = useCapabilities();
  const { modal } = App.useApp();
  const [alt, setAlt] = useState("");
  const [fromImage, setFromImage] = useState(false);
  const ready = job.media?.status === "ready";
  const currency = job.operation.priceSchedule?.currency ?? "USD";
  const cost = job.operation.settledMicros !== null ? `${money(job.operation.settledMicros, currency)} (${job.operation.costState})` : `up to ${money(job.operation.reservedMicros, currency)} reserved`;
  const canApprove = can(PERMISSION.aiContentApprove) && can(PERMISSION.postsUpdate) && EDITABLE.includes(topic.status) && data.post;
  return (
    <Card size="small" type="inner" title={<Space wrap><span>Image {job.imageVersion}</span><Tag color={STATUS_COLOR[job.status]}>{STATUS_LABEL[job.status]}</Tag>{job.isFeatured && <Tag color="green">Featured</Tag>}</Space>}>
      <Space direction="vertical" style={{ width: "100%" }}>
        {ready && job.media?.previewUrl && (
          <img src={job.media.previewUrl} alt={`Generated image ${job.imageVersion}, awaiting description`} style={{ maxWidth: "100%", width: 480, borderRadius: 8 }} />
        )}
        {job.media && job.media.status === "quarantined" && <Typography.Text type="secondary">Processing through the media pipeline…</Typography.Text>}
        {job.media?.status === "rejected" && <Alert type="error" showIcon message={job.media.rejectionReason ?? "The media pipeline rejected this image."} />}
        {job.status === "outcome_unknown" && (
          <Alert
            type="warning"
            showIcon
            message="The provider may have made this image"
            description="It is never requested again automatically. Resolve it before generating another."
            action={
              can(PERMISSION.aiContentConfigure) && (
                <Button
                  size="small"
                  onClick={() => {
                    let note = "";
                    modal.confirm({
                      title: "Abandon this request and count its full reservation as spent?",
                      content: <Input.TextArea aria-label="What you checked" rows={3} maxLength={500} onChange={(e) => (note = e.target.value)} />,
                      okText: "Abandon",
                      onOk: () => act(() => aiContentApi.resolveOperation(job.operationId, "abandon", note), "Request abandoned"),
                    });
                  }}
                >
                  Abandon
                </Button>
              )
            }
          />
        )}
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "model", label: "Model", children: `${job.model} · ${job.size} · ${job.quality}` },
            { key: "cost", label: "Cost", children: cost },
            { key: "disclosure", label: "Reader disclosure", children: job.disclosureText },
            ...(job.failureCode ? [{ key: "failure", label: "Failure", children: job.failureCode.replace(/_/g, " ") }] : []),
            ...(job.reviewNote ? [{ key: "note", label: "Review note", children: job.reviewNote }] : []),
          ]}
        />
        {(job.status === "stored" || job.status === "approved") && ready && canApprove && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input.TextArea aria-label={`Alt text for image ${job.imageVersion}`} rows={2} maxLength={255} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe what this image actually shows" />
            <Checkbox checked={fromImage} onChange={(e) => setFromImage(e.target.checked)}>
              I wrote this alt text from the image above, not from the draft
            </Checkbox>
            <Space wrap>
              <Button
                type="primary"
                loading={busy}
                disabled={!fromImage || !alt.trim()}
                onClick={() =>
                  modal.confirm({
                    title: "Use this image as the featured image?",
                    content: data.post?.coverMediaId ? "It replaces the current featured image. Facts and approval must be confirmed again." : "Facts and approval must be confirmed again.",
                    okText: "Approve and use",
                    onOk: () => act(() => aiContentApi.approveImage(job.id, data.post!.version, alt.trim()), "Featured image approved"),
                  })
                }
              >
                Approve and use as featured image
              </Button>
              {job.status === "stored" && can(PERMISSION.aiContentReview) && (
                <Button
                  danger
                  disabled={busy}
                  onClick={() => {
                    let note = "";
                    modal.confirm({
                      title: "Reject this image?",
                      content: <Input.TextArea aria-label="Why it is rejected" rows={3} maxLength={500} onChange={(e) => (note = e.target.value)} />,
                      okText: "Reject",
                      onOk: () => act(() => aiContentApi.rejectImage(job.id, note), "Image rejected"),
                    });
                  }}
                >
                  Reject
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Space>
    </Card>
  );
}
