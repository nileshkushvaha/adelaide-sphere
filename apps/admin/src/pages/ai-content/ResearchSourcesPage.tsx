import { FormSelect } from "@/components/FormSelect";
import { useState } from "react";
import { App, Button, Collapse, Form, Input, Select, Switch, Table, Typography } from "antd";
import { SOURCE_TIER_LABELS, aiContentApi, type ResearchSource } from "@/api/ai-content";
import { ErrorState, PageHeader, PageLoader, TableCard } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useDocumentTitle } from "@/shared/useDocumentTitle";

const TIERS = (["official_government", "official_business", "institutional", "publication"] as const).map((value) => ({ value, label: SOURCE_TIER_LABELS[value] }));

/**
 * The research source registry (plan §G): which public hosts count as which
 * kind of source, and which feeds discovery reads. Configuration only; the
 * server validates hosts and feeds and records every change.
 */
export function ResearchSourcesPage() {
  useDocumentTitle("AI research sources");
  const { message } = App.useApp();
  const [state, reload] = useAsync(() => aiContentApi.sources(), []);
  const [form] = Form.useForm<{ host: string; label: string; tier: ResearchSource["tier"]; feedUrl?: string }>();
  const [updating, setUpdating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = async (source: ResearchSource, input: Partial<Pick<ResearchSource, "tier" | "active">>) => {
    setUpdating(source.id);
    try {
      await aiContentApi.updateSource(source, input);
      message.success("Source updated.");
      reload();
    } catch (error) {
      message.error(errorMessage(error));
      reload();
    } finally {
      setUpdating(null);
    }
  };
  return (
    <>
      <PageHeader title="Research sources" description="Manage public websites used for evidence and feeds used to suggest topics." crumbs={[{ label: "AI Content", href: "/ai-content" }]} />
      <Collapse style={{ marginBottom: 20 }} items={[{ key: "add", label: "Add a research source", children: <div>
        <Typography.Paragraph type="secondary">Official sources establish first-party facts; publications only corroborate or signal.</Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          onFinish={async (values) => {
            setSaving(true);
            try {
              await aiContentApi.createSource({ ...values, feedUrl: values.feedUrl?.trim() || null });
              message.success("Research source added.");
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
          <Form.Item name="host" label="Website domain" extra="For example: example.org" rules={[{ required: true, message: "Enter a host name" }]}>
            <Input placeholder="e.g. www.cityofadelaide.com.au" maxLength={253} autoComplete="off" />
          </Form.Item>
          <Form.Item name="label" label="Name" rules={[{ required: true, message: "Enter a name" }]}>
            <Input placeholder="e.g. City of Adelaide" maxLength={120} />
          </Form.Item>
          <Form.Item name="tier" label="Kind of source" rules={[{ required: true, message: "Choose a kind" }]}>
            <FormSelect placeholder="Choose a kind of source" options={TIERS} />
          </Form.Item>
          <Form.Item name="feedUrl" label="Feed address (optional)" extra="An https RSS or Atom feed on this host.">
            <Input inputMode="url" maxLength={500} placeholder="https://" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Add source
          </Button>
        </Form>
      </div> }]} />
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
            scroll={{ x: 900 }}
            locale={{ emptyText: "No sources yet" }}
            columns={[
              { title: "Website", dataIndex: "host" },
              { title: "Name", dataIndex: "label" },
              { title: "Kind", render: (_: unknown, s: ResearchSource) => <Select placeholder="Kind of source" aria-label={`Kind of ${s.host}`} disabled={updating !== null} value={s.tier} options={TIERS} onChange={(tier) => update(s, { tier })} style={{ minWidth: 240 }} /> },
              { title: "Feed", render: (_: unknown, s: ResearchSource) => s.feedUrl ?? "None" },
              { title: "Active", render: (_: unknown, s: ResearchSource) => <Switch disabled={updating !== null} loading={updating === s.id} aria-label={`${s.host} active`} checked={s.active} onChange={(active) => update(s, { active })} /> },
            ]}
          />
        </TableCard>
      )}
    </>
  );
}
