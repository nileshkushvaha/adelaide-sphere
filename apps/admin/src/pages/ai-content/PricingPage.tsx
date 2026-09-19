import { useState } from "react";
import { Link } from "react-router";
import { App, Button, Card, Collapse, DatePicker, Form, Input, InputNumber, Select, Table, Typography } from "antd";
import { aiContentApi, money, type ImageEvidence, type ImageModelInfo, type PriceSchedule } from "@/api/ai-content";
import { ErrorState, PageHeader, PageLoader, TableCard, StatusTag } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { BudgetCard } from "./GenerationPanels";

const perMillion = (micros: number, currency: string) => `${currency} ${new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(micros / 1_000_000)}`;

/**
 * The approved, versioned price schedule (owner budget rule). A paid call can
 * only be priced by an approved entry; approving one retires the previous
 * version for that model. Entries are never edited: a price change is a new version.
 */
export function PricingPage() {
  useDocumentTitle("AI pricing");
  const { message, modal } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.prices(), []);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [models] = useAsync(() => aiContentApi.imageModels(), []);
  const imageModels: ImageModelInfo[] = models.status === "ready" ? models.data : [];
  const provider = Form.useWatch("provider", form) as string | undefined;
  const model = Form.useWatch("model", form) as string | undefined;
  const image = imageModels.find((m) => m.provider === provider && m.model === model);
  const perImage = image?.priceUnit === "image";
  return (
    <>
      <PageHeader title="AI pricing and budget" description="Prices must match the provider's published pricing before they are approved." crumbs={[{ label: "AI Content", href: "/ai-content" }]} />
      <BudgetCard />
      <Collapse style={{ margin: "16px 0" }} items={[{ key: "propose", label: "Propose a new price version", children: <div>
        <Typography.Paragraph type="secondary">Enter amounts per million tokens as published, with the page they come from.</Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          initialValues={{ provider: "openai", currency: "USD", longContextThresholdTokens: 272000 }}
          onFinish={async (v) => {
            setSaving(true);
            try {
              await aiContentApi.proposePrice({
                version: v.version,
                provider: v.provider,
                model: v.model,
                currency: v.currency,
                // A per-image price still bills prompt input per token; it has no cached or image-output token rate.
                inputMicrosPerMTok: Math.round(v.input * 1_000_000),
                cachedInputMicrosPerMTok: perImage ? 0 : Math.round(v.cached * 1_000_000),
                outputMicrosPerMTok: perImage ? 0 : Math.round(v.output * 1_000_000),
                longContextThresholdTokens: v.longContextThresholdTokens,
                ...(image
                  ? {
                      imageResolution: v.imageResolution,
                      imageQuality: v.imageQuality,
                      pricingUnit: image.priceUnit,
                      ...(perImage ? { perImageMicros: Math.round(v.perImage * 1_000_000) } : { maxOutputTokens: v.maxOutputTokens }),
                      ...(image.billsTextOutput ? { textOutputMicrosPerMTok: Math.round(v.textOutput * 1_000_000), maxTextOutputTokens: v.maxTextOutputTokens } : {}),
                    }
                  : {}),
                sourceUrl: v.sourceUrl,
                effectiveFrom: v.effectiveFrom.toISOString(),
              });
              form.resetFields();
              reload();
            } catch (error) {
              form.setFields(Object.entries(fieldErrors(error)).map(([name, errors]) => ({ name, errors })) as never);
              message.error(errorMessage(error));
            } finally {
              setSaving(false);
            }
          }}
        >
          <Form.Item name="version" label="Version name" extra="For example: openai-gpt-5.6-terra-2026-07-30" rules={[{ required: true, message: "Name this version" }]}>
            <Input placeholder="e.g. openai-gpt-5.6-terra-2026-07-30" maxLength={64} />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select placeholder="Choose a provider"
              onChange={() => form.setFieldValue("model", undefined)}
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "google", label: "Google Gemini" },
                { value: "xai", label: "xAI" },
              ]}
            />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true, message: "Choose a model" }]}>
            <Select placeholder="Choose a model"
              options={[
                ...(provider === "openai"
                  ? [
                      { value: "gpt-5.6-terra", label: "gpt-5.6-terra (articles)" },
                      { value: "gpt-5.6-luna", label: "gpt-5.6-luna (suggestions)" },
                    ]
                  : []),
                ...imageModels.filter((m) => m.provider === provider).map((m) => ({ value: m.model, label: `${m.model} (images)` })),
              ]}
            />
          </Form.Item>
          {image && (
            <>
              <Typography.Paragraph type="secondary">
                {image.label} is billed per {image.priceUnit}
                {image.billsTextOutput ? ", with text or thinking output billed on every image" : ""}
                {image.priceUnit === "image" ? ", with one price for each resolution and quality" : ""}. {image.reportsCost ? "Each result states what was billed; it must match this price. " : ""}Processing: {image.processingLocation} Retention: {image.retention}
              </Typography.Paragraph>
              <Form.Item name="imageResolution" label="Resolution this price covers" rules={[{ required: true, message: "Choose a resolution" }]}>
                <Select placeholder="Choose a resolution" options={image.resolutions.map((v) => ({ value: v, label: v.toUpperCase() }))} />
              </Form.Item>
              <Form.Item name="imageQuality" label="Image quality this price covers" rules={[{ required: true, message: "Choose a quality" }]}>
                <Select placeholder="Choose a quality" options={image.qualities.map((v) => ({ value: v, label: v }))} />
              </Form.Item>
              {perImage ? (
                <Form.Item name="perImage" label="Price of one image" rules={[{ required: true, message: "Enter the price of one image" }]}>
                  <InputNumber placeholder="e.g. 0.04" min={0.000001} step={0.001} style={{ width: "100%", maxWidth: 240 }} />
                </Form.Item>
              ) : (
                <Form.Item
                  name="maxOutputTokens"
                  label="Most output tokens for one image"
                  extra="The bound each image is reserved against. Usage above it halts paid calls."
                  rules={[{ required: true, message: "Enter the per-image bound" }]}
                >
                  <InputNumber placeholder="e.g. 3000" min={1} max={100000} style={{ width: "100%", maxWidth: 240 }} />
                </Form.Item>
              )}
              {image.billsTextOutput && (
                <>
                  <Form.Item name="textOutput" label="Text and thinking output, per million tokens" rules={[{ required: true, message: "Enter the text output price" }]}>
                    <InputNumber placeholder="e.g. 3.00" min={0.000001} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
                  </Form.Item>
                  <Form.Item
                    name="maxTextOutputTokens"
                    label="Most text and thinking tokens for one image"
                    extra="Reserved on every image; usage above it halts paid calls."
                    rules={[{ required: true, message: "Enter the per-image bound" }]}
                  >
                    <InputNumber placeholder="e.g. 4000" min={1} max={100000} style={{ width: "100%", maxWidth: 240 }} />
                  </Form.Item>
                </>
              )}
            </>
          )}
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <Select placeholder="Choose a currency" options={["USD", "AUD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item
            name="input"
            label="Input, per million tokens"
            extra={perImage ? "Enter 0 if the provider bills only per image." : undefined}
            rules={[{ required: true, message: "Enter the input price" }]}
          >
            <InputNumber placeholder="e.g. 5.00" min={perImage ? 0 : 0.000001} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          {!perImage && (
            <>
              <Form.Item name="cached" label="Cached input, per million tokens" rules={[{ required: true, message: "Enter the cached input price" }]}>
                <InputNumber placeholder="e.g. 1.25" min={0} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
              </Form.Item>
              <Form.Item name="output" label={image ? "Image output, per million tokens" : "Output, per million tokens"} rules={[{ required: true, message: "Enter the output price" }]}>
                <InputNumber placeholder="e.g. 30.00" min={0.000001} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="longContextThresholdTokens" label="Long-context threshold (input tokens)" extra="Calls that could exceed it are refused.">
            <InputNumber placeholder="e.g. 272000" min={1000} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          <Form.Item name="sourceUrl" label="Official pricing page" rules={[{ required: true, message: "Enter the source" }]}>
            <Input inputMode="url" maxLength={500} placeholder="https://" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Effective from" rules={[{ required: true, message: "Choose a date" }]}>
            <DatePicker placeholder="Choose a date" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Save price proposal
          </Button>
        </Form>
      </div> }]} />
      <ImageEvidenceCard />
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <TableCard>
          <Table
            rowKey="id"
            dataSource={state.data}
            pagination={false}
            scroll={{ x: 1000 }}
            columns={[
              { title: "Version", dataIndex: "version" },
              { title: "Model", render: (_: unknown, p: PriceSchedule) => `${p.provider} ${p.model} (${p.serviceTier})${p.imageSize ? ` · ${p.imageSize.toUpperCase()} ${p.imageQuality}` : ""}` },
              {
                title: "Price (per 1M tokens: input / cached / output, or per image)",
                render: (_: unknown, p: PriceSchedule) =>
                  p.pricingUnit === "image"
                    ? `${perMillion(p.perImageMicros ?? 0, p.currency)} per image · input ${perMillion(p.inputMicrosPerMTok, p.currency)} per 1M` +
                      (p.textOutputMicrosPerMTok ? ` · text ${perMillion(p.textOutputMicrosPerMTok, p.currency)} per 1M, ≤${p.maxTextOutputTokens}` : "")
                    : `${perMillion(p.inputMicrosPerMTok, p.currency)} / ${perMillion(p.cachedInputMicrosPerMTok, p.currency)} / ${perMillion(p.outputMicrosPerMTok, p.currency)}${p.maxOutputTokens ? ` · ≤${p.maxOutputTokens} image tokens` : ""}` +
                    (p.textOutputMicrosPerMTok ? ` · text ${perMillion(p.textOutputMicrosPerMTok, p.currency)} per 1M, ≤${p.maxTextOutputTokens}` : ""),
              },
              { title: "Source", render: (_: unknown, p: PriceSchedule) => <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(p.sourceUrl).host}</a> },
              { title: "Status", render: (_: unknown, p: PriceSchedule) => <StatusTag status={p.status} /> },
              {
                title: "Action",
                render: (_: unknown, p: PriceSchedule) =>
                  p.status === "proposed" ? (
                    <Button
                      size="small"
                      onClick={() =>
                        modal.confirm({
                          title: `Approve ${p.version}?`,
                          okText: "Approve price version",
                          cancelText: "Keep proposed",
                          content: "Check these amounts against the official pricing page first. The previous approved version for this model is retired.",
                          onOk: async () => {
                            try {
                              await aiContentApi.approvePrice(p.id);
                              reload();
                            } catch (error) {
                              message.error(errorMessage(error));
                            }
                          },
                        })
                      }
                    >
                      Approve
                    </Button>
                  ) : null,
              },
            ]}
          />
        </TableCard>
      )}
    </>
  );
}

/**
 * Pilot evidence for the image-provider decision (provider amendment 01): the
 * recorded facts of each generated image. There is no automated score; the
 * owner judges the images themselves on the article pages.
 */
function ImageEvidenceCard() {
  const [page, setPage] = useState(1);
  const [state, reload] = useAsync(() => aiContentApi.imageEvidence({ page, pageSize: 20 }), [page]);
  return (
    <Card title={<h2 className="as-ai-card-heading">Image pilot evidence</h2>} style={{ marginBottom: 16 }}>
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <Table
          size="small"
          rowKey="jobId"
          dataSource={state.data.data}
          scroll={{ x: 1000 }}
          pagination={{ current: page, pageSize: 20, total: state.data.meta.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: "Topic", render: (_: unknown, e: ImageEvidence) => <Link to={`/ai-content/topics/${e.itemId}`}>{e.topic}</Link> },
            { title: "Provider and model", render: (_: unknown, e: ImageEvidence) => `${e.provider} ${e.model}${e.servedModel && e.servedModel !== e.model ? ` (served by ${e.servedModel})` : ""}` },
            { title: "Setting", render: (_: unknown, e: ImageEvidence) => `${e.aspectRatio ?? "—"} · ${(e.resolution ?? e.size).toUpperCase()} · ${e.quality}` },
            { title: "Prompt policy", dataIndex: "policyVersion" },
            { title: "Time", render: (_: unknown, e: ImageEvidence) => (e.latencyMs === null ? "—" : `${(e.latencyMs / 1000).toFixed(1)} s`) },
            {
              title: "Reserved / actual",
              render: (_: unknown, e: ImageEvidence) =>
                `${money(e.reservedMicros, e.currency ?? "USD")} / ${e.settledMicros === null ? "—" : money(e.settledMicros, e.currency ?? "USD")}${e.costState === "uncertain" ? " (uncertain)" : ""}` +
                (e.reportedCostMicros !== null ? ` · provider billed ${money(e.reportedCostMicros, "USD")}` : ""),
            },
            { title: "Provider request", render: (_: unknown, e: ImageEvidence) => e.providerRequestId ?? "—" },
            { title: "Media and hash", render: (_: unknown, e: ImageEvidence) => (e.mediaAssetId ? `${e.mediaAssetId} · ${e.checksum?.slice(0, 12)}…` : "—") },
            { title: "Regeneration", render: (_: unknown, e: ImageEvidence) => (e.regeneration ? "Yes" : "No") },
            { title: "Result", render: (_: unknown, e: ImageEvidence) => <StatusTag status={e.status} label={e.failureCode ? e.failureCode.replace(/_/g, " ") : undefined} /> },
          ]}
        />
      )}
    </Card>
  );
}
