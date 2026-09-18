import { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
} from "antd";
import { settingsGroupsApi } from "@/api/settings-groups";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useUnsavedChanges } from "@/shared/useUnsavedChanges";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { AutomationNotice } from "./AiContentPages";
export function AiSettingsPage() {
  useDocumentTitle("AI Settings");
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, reload] = useAsync(async () => {
    const [registry, values] = await Promise.all([
      settingsGroupsApi.registry(),
      settingsGroupsApi.values("ai-content"),
    ]);
    const group = registry.find((g) => g.key === "ai_content");
    if (!group) throw new Error("AI settings registry unavailable");
    return { group, values };
  }, []);
  useEffect(() => {
    if (state.status === "ready") form.setFieldsValue(state.data.values.values);
  }, [state, form]);
  const save = async (values: Record<string, unknown>) => {
    if (state.status !== "ready") return;
    setSaving(true);
    setError(null);
    try {
      await settingsGroupsApi.update(
        "ai-content",
        state.data.values.version,
        values,
      );
      setDirty(false);
      message.success(
        "Configuration saved. Automated execution remains inactive.",
      );
      reload();
    } catch (e) {
      setError(errorMessage(e));
      form.setFields(
        Object.entries(fieldErrors(e) ?? {}).map(([name, errors]) => ({
          name,
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
        title="AI Settings"
        description="Saved configuration for later workstreams. These values do not enable execution in Phase 1A."
      />
      <AutomationNotice />
      {error && <ErrorState message={error} />}
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <Card>
          <Form
            name="ai-settings"
            form={form}
            disabled={saving}
            onValuesChange={() => setDirty(true)}
            layout="vertical"
            onFinish={(v) => void save(v)}
          >
            {state.data.group.settings.map((setting) => (
              <Form.Item
                key={setting.key}
                name={setting.key}
                label={setting.label}
                extra={setting.description}
                valuePropName={setting.type === "boolean" ? "checked" : "value"}
                rules={
                  setting.type === "boolean"
                    ? []
                    : setting.type === "integer"
                      ? [
                          {
                            required: true,
                            type: "integer",
                            min: setting.bounds.min,
                            max: setting.bounds.max,
                          },
                        ]
                      : [
                          {
                            required: true,
                            ...(setting.type === "string"
                              ? {
                                  whitespace: true,
                                  min: setting.bounds.min,
                                  max: setting.bounds.max,
                                }
                              : {}),
                          },
                        ]
                }
              >
                {setting.type === "boolean" ? (
                  <Switch />
                ) : setting.type === "enum" ? (
                  <Select
                    options={setting.bounds.values?.map((value) => ({
                      value,
                      label: value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()),
                    }))}
                  />
                ) : setting.type === "integer" ? (
                  <InputNumber
                    min={setting.bounds.min}
                    max={setting.bounds.max}
                    style={{ width: "100%", maxWidth: 320 }}
                  />
                ) : setting.key === "editorialStrategy" ? (
                  <Input.TextArea maxLength={setting.bounds.max} rows={4} />
                ) : (
                  <Input maxLength={setting.bounds.max} />
                )}
              </Form.Item>
            ))}
            <Button type="primary" htmlType="submit" loading={saving}>
              Save AI settings
            </Button>
            {error && (
              <Button
                disabled={saving}
                onClick={() =>
                  modal.confirm({
                    title: "Reload settings?",
                    content:
                      "Your unsaved form values will be replaced with the latest saved values. Keep editing to preserve them.",
                    onOk: () => {
                      setError(null);
                      setDirty(false);
                      reload();
                    },
                  })
                }
              >
                Reload saved settings
              </Button>
            )}
          </Form>
        </Card>
      )}
    </>
  );
}
