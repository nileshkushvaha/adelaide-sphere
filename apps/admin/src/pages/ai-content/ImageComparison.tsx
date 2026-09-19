import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Modal, Select, Space, Table, Typography } from "antd";
import { aiContentApi, money, type AiTopic, type ComparisonCandidate, type ComparisonQuote, type ImageModelInfo } from "@/api/ai-content";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";

interface Row {
  key: string;
  info: ImageModelInfo;
  selected: boolean;
  resolution: string;
  quality: string;
}

const ASPECTS = ["16:9", "3:2", "1:1", "2:3"];

/**
 * A controlled provider comparison (provider amendment 01): the same screened
 * prompt to 2–4 chosen provider settings, run only after a person sees each
 * maximum cost and the total. Results appear with the other images; none is
 * attached until someone approves one. The server enforces every rule.
 */
export function CompareProvidersButton({ topic, prompt, disabled, onDone }: { topic: AiTopic; prompt: string; disabled: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)}>
        Compare providers
      </Button>
      {open && (
        <ComparisonDialog
          topic={topic}
          prompt={prompt}
          onClose={(ran) => {
            setOpen(false);
            if (ran) onDone();
          }}
        />
      )}
    </>
  );
}

function ComparisonDialog({ topic, prompt, onClose }: { topic: AiTopic; prompt: string; onClose: (ran: boolean) => void }) {
  const [models] = useAsync(() => aiContentApi.imageModels(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [quote, setQuote] = useState<ComparisonQuote | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // One key per intended comparison: a retry after a lost response is the same comparison, never a second charge.
  const requestKey = useRef<string>(crypto.randomUUID());

  const current: Row[] =
    rows ??
    (models.status === "ready"
      ? models.data.map((info) => ({ key: `${info.provider}:${info.model}`, info, selected: false, resolution: info.resolutions[0]!, quality: info.qualities.includes("medium") ? "medium" : info.qualities[0]! }))
      : []);
  const update = (key: string, patch: Partial<Row>) => {
    setQuote(null);
    setRows(current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const chosen: ComparisonCandidate[] = current.filter((r) => r.selected).map((r) => ({ provider: r.info.provider, model: r.info.model, resolution: r.resolution, quality: r.quality }));
  const input = { ...(prompt.trim() ? { prompt: prompt.trim() } : {}), aspectRatio, candidates: chosen };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(false);
    }
  };
  const lines = problem ? Object.values(fieldErrors(problem)).flat() : [];

  return (
    <Modal
      open
      title="Compare image providers"
      width={760}
      onCancel={() => !busy && onClose(false)}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      footer={
        <Space wrap>
          <Button disabled={busy} onClick={() => onClose(false)}>Cancel</Button>
          <Button disabled={busy || chosen.length < 2 || chosen.length > 4} loading={busy && !quote} onClick={() => void run(async () => setQuote(await aiContentApi.quoteImageComparison(topic.id, input)))}>
            Show maximum cost
          </Button>
          <Button
            type="primary"
            disabled={busy || !quote}
            loading={busy && Boolean(quote)}
            onClick={() =>
              void run(async () => {
                await aiContentApi.requestImageComparison(topic, requestKey.current, { ...input, expectedTotalMicros: quote!.totalMicros });
                onClose(true);
              })
            }
          >
            {quote ? `Run comparison (up to ${money(quote.totalMicros, quote.currency)})` : "Run comparison"}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          The same prompt goes to each chosen setting. Each call is reserved from the image budget. Nothing is attached.
        </Typography.Paragraph>
        {Boolean(problem) && <Alert type="error" showIcon role="alert" message={errorMessage(problem)} description={lines.length ? lines.map((l) => <div key={l}>{l}</div>) : undefined} />}
        <Space wrap align="center">
          <Typography.Text id="ai-compare-aspect">Aspect ratio</Typography.Text>
          <Select placeholder="Aspect ratio"
            disabled={busy}
            aria-labelledby="ai-compare-aspect"
            value={aspectRatio}
            onChange={(v) => {
              setQuote(null);
              setAspectRatio(v);
            }}
            options={ASPECTS.map((a) => ({ value: a, label: a }))}
            style={{ minWidth: 120 }}
          />
        </Space>
        {models.status === "error" && <Alert type="error" showIcon message={models.message} />}
        <Typography.Text type="secondary">Choose 2–4 models to compare. Review the maximum cost before running.</Typography.Text>
        {current.map((r) => (
          <Space key={r.key} wrap align="center">
            <Checkbox disabled={busy || (!r.selected && chosen.length >= 4)} checked={r.selected} onChange={(e) => update(r.key, { selected: e.target.checked })}>
              {r.info.label}
            </Checkbox>
            <Select placeholder="Resolution" disabled={busy || !r.selected} aria-label={`Resolution for ${r.info.model}`} size="small" value={r.resolution} onChange={(v) => update(r.key, { resolution: v })} options={r.info.resolutions.map((v) => ({ value: v, label: v.toUpperCase() }))} />
            <Select placeholder="Quality" disabled={busy || !r.selected} aria-label={`Quality for ${r.info.model}`} size="small" value={r.quality} onChange={(v) => update(r.key, { quality: v })} options={r.info.qualities.map((v) => ({ value: v, label: v }))} />
          </Space>
        ))}
        {quote && (
          <Table
            size="small"
            rowKey={(c) => `${c.provider}:${c.model}:${c.resolution}:${c.quality}`}
            pagination={false}
            scroll={{ x: true }}
            dataSource={quote.candidates}
            columns={[
              { title: "Provider and model", render: (_: unknown, c) => `${c.provider} ${c.model}` },
              { title: "Setting", render: (_: unknown, c) => `${quote.aspectRatio} · ${c.resolution.toUpperCase()} · ${c.quality}` },
              { title: "Maximum", render: (_: unknown, c) => money(c.maxMicros, quote.currency) },
              { title: "Processing", render: (_: unknown, c) => c.processingLocation },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  Total maximum
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2}>
                  {money(quote.totalMicros, quote.currency)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        )}
      </Space>
    </Modal>
  );
}
