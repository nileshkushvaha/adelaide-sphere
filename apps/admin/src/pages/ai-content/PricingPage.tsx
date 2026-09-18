import { useState } from "react";
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Select, Table, Tag, Typography } from "antd";
import { aiContentApi, type PriceSchedule } from "@/api/ai-content";
import { ErrorState, PageHeader, PageLoader, TableCard } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { BudgetCard } from "./GenerationPanels";

const perMillion = (micros: number, currency: string) => `${currency} ${(micros / 1_000_000).toFixed(2)}`;

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
  const model = Form.useWatch("model", form) as string | undefined;
  const isImage = model?.startsWith("gpt-image") ?? false;
  return (
    <>
      <PageHeader title="AI pricing and budget" description="Prices must match the provider's published pricing before they are approved." crumbs={[{ label: "AI Content", href: "/ai-content" }]} />
      <BudgetCard />
      <Card title="Propose a price version" style={{ margin: "16px 0" }}>
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
                inputMicrosPerMTok: Math.round(v.input * 1_000_000),
                cachedInputMicrosPerMTok: Math.round(v.cached * 1_000_000),
                outputMicrosPerMTok: Math.round(v.output * 1_000_000),
                longContextThresholdTokens: v.longContextThresholdTokens,
                ...(isImage ? { imageSize: v.imageSize, imageQuality: v.imageQuality, maxOutputTokens: v.maxOutputTokens } : {}),
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
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={[{ value: "openai", label: "OpenAI" }]} />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true, message: "Choose a model" }]}>
            <Select
              options={[
                { value: "gpt-5.6-terra", label: "gpt-5.6-terra (articles)" },
                { value: "gpt-5.6-luna", label: "gpt-5.6-luna (suggestions)" },
                { value: "gpt-image-2.5-flare", label: "gpt-image-2.5-flare (images)" },
              ]}
            />
          </Form.Item>
          {isImage && (
            <>
              <Form.Item name="imageSize" label="Image size this price covers" rules={[{ required: true, message: "Choose a size" }]}>
                <Select options={["1536x1024", "1024x1024", "1024x1536"].map((v) => ({ value: v, label: v }))} />
              </Form.Item>
              <Form.Item name="imageQuality" label="Image quality this price covers" rules={[{ required: true, message: "Choose a quality" }]}>
                <Select options={["low", "medium", "high"].map((v) => ({ value: v, label: v }))} />
              </Form.Item>
              <Form.Item
                name="maxOutputTokens"
                label="Most output tokens for one image"
                extra="The bound each image is reserved against. Usage above it halts paid calls."
                rules={[{ required: true, message: "Enter the per-image bound" }]}
              >
                <InputNumber min={1} max={100000} style={{ width: "100%", maxWidth: 240 }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <Select options={["USD", "AUD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="input" label="Input, per million tokens" rules={[{ required: true, message: "Enter the input price" }]}>
            <InputNumber min={0.000001} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          <Form.Item name="cached" label="Cached input, per million tokens" rules={[{ required: true, message: "Enter the cached input price" }]}>
            <InputNumber min={0} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          <Form.Item name="output" label="Output, per million tokens" rules={[{ required: true, message: "Enter the output price" }]}>
            <InputNumber min={0.000001} step={0.01} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          <Form.Item name="longContextThresholdTokens" label="Long-context threshold (input tokens)" extra="Calls that could exceed it are refused.">
            <InputNumber min={1000} style={{ width: "100%", maxWidth: 240 }} />
          </Form.Item>
          <Form.Item name="sourceUrl" label="Official pricing page" rules={[{ required: true, message: "Enter the source" }]}>
            <Input inputMode="url" maxLength={500} placeholder="https://" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Effective from" rules={[{ required: true, message: "Choose a date" }]}>
            <DatePicker />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Propose
          </Button>
        </Form>
      </Card>
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
            scroll={{ x: true }}
            columns={[
              { title: "Version", dataIndex: "version" },
              { title: "Model", render: (_: unknown, p: PriceSchedule) => `${p.provider} ${p.model} (${p.serviceTier})${p.imageSize ? ` · ${p.imageSize} ${p.imageQuality} · ≤${p.maxOutputTokens} output tokens` : ""}` },
              { title: "Input / cached / output per 1M", render: (_: unknown, p: PriceSchedule) => `${perMillion(p.inputMicrosPerMTok, p.currency)} / ${perMillion(p.cachedInputMicrosPerMTok, p.currency)} / ${perMillion(p.outputMicrosPerMTok, p.currency)}` },
              { title: "Source", render: (_: unknown, p: PriceSchedule) => <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(p.sourceUrl).host}</a> },
              { title: "Status", render: (_: unknown, p: PriceSchedule) => <Tag color={p.status === "approved" ? "green" : p.status === "retired" ? "default" : "gold"}>{p.status}</Tag> },
              {
                title: "Action",
                render: (_: unknown, p: PriceSchedule) =>
                  p.status === "proposed" ? (
                    <Button
                      size="small"
                      onClick={() =>
                        modal.confirm({
                          title: `Approve ${p.version}?`,
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
