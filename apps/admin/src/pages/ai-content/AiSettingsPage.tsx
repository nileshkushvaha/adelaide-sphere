import { useEffect, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
} from "antd";
import { aiContentApi } from "@/api/ai-content";
import { settingsGroupsApi } from "@/api/settings-groups";
import { blogApi } from "@/api/blog";
import { ErrorState, PageHeader, PageLoader, SettingsSection, StickyActions } from "@/components/ui";
import { errorMessage, fieldErrors, useAsync } from "@/shared/useAsync";
import { useUnsavedChanges } from "@/shared/useUnsavedChanges";
import { useDocumentTitle } from "@/shared/useDocumentTitle";
import { AutomationNotice } from "./AiContentPages";
/** Product names and tiers, not the stored codes; anything else reads as a sentence. */
const OPTION_LABELS: Record<string, string> = { openai: "OpenAI", xai: "xAI", google: "Google Gemini", "1k": "1K", "2k": "2K" };
const optionLabel = (value: string) => OPTION_LABELS[value] ?? value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const MONEY_LABELS: Record<string, string> = {
  hardDailyLimitMinor: "Article budget per day", hardMonthlyLimitMinor: "Article budget per month",
  imageDailyLimitMinor: "Image budget per day", imageMonthlyLimitMinor: "Image budget per month",
  maxWorkflowCostMinor: "Maximum cost per article (text and images)",
};
const SETTINGS_SECTIONS = [
  { key: "operating", title: "Operating mode", description: "Control how topics enter the workflow and how articles are reviewed." },
  { key: "editorial", title: "Editorial direction & authorship", description: "Choose the audience, author and disclosure readers will see." },
  { key: "research", title: "Research & discovery", description: "Set source freshness, relevant topics and the published context used for research." },
  { key: "schedule", title: "Research schedule", description: "Set the daily research window in Adelaide time. Publication still needs approval." },
  { key: "budget", title: "Spending limits", description: "Limits include money already spent and amounts reserved for work in progress." },
  { key: "images", title: "Featured images", description: "Choose image handling, provider options and the disclosure shown below images." },
  { key: "retention", title: "Data retention", description: "Control how long completed topics retain private working material." },
] as const;
function settingSection(key: string) {
  if (/LimitMinor$|^budget|^warningThreshold|^maxWorkflowCostMinor/.test(key)) return "budget";
  if (/^image|^featuredImage/.test(key)) return "images";
  if (/^slot|^postingEnabled|^targetPosts|^maxSlots|^timezone/.test(key)) return "schedule";
  if (/^freshness|^discovery|^excluded|^context/.test(key)) return "research";
  if (key === "aiRetentionDays") return "retention";
  if (["enabled", "titleMode", "publicationMode"].includes(key)) return "operating";
  return "editorial";
}

export function AiSettingsPage() {
  useDocumentTitle("AI Settings");
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const currency = Form.useWatch("budgetCurrency", form) as string | undefined;
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
      message.success("AI settings saved.");
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
        crumbs={[{ label: "AI Content", href: "/ai-content" }]}
        description="How AI content runs. Paid calls also need an approved price, a budget and a server-side key."
      />
      <AutomationNotice />
      {error && <ErrorState message={error} />}
      {state.status === "loading" ? (
        <PageLoader />
      ) : state.status === "error" ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <>
          <Form
            name="ai-settings"
            form={form}
            disabled={saving}
            onValuesChange={() => setDirty(true)}
            layout="vertical"
            onFinish={(v) => void save(v)}
            scrollToFirstError
          >
            {SETTINGS_SECTIONS.map((section) => <SettingsSection key={section.key} title={section.title} description={section.description}>
              <div className="as-ai-form-grid">
              {state.data.group.settings.filter((setting) => settingSection(setting.key) === section.key).map((setting) => (
              <Form.Item
                key={setting.key}
                className={setting.type === "string" && (setting.bounds.max ?? 0) > 255 ? "as-ai-form-wide" : undefined}
                name={setting.key}
                label={MONEY_LABELS[setting.key] ?? setting.label}
                extra={MONEY_LABELS[setting.key] ? "Spent and reserved amounts count together. Zero allows no new spending." : setting.description}
                getValueProps={MONEY_LABELS[setting.key] ? (value: number | null) => ({ value: value == null ? null : value / 100 }) : undefined}
                normalize={MONEY_LABELS[setting.key] ? (value: number | null) => value == null ? null : Math.round(value * 100) : undefined}
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
                            // An optional text setting (minimum length 0) may be left empty.
                            required: setting.bounds.min !== 0,
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
                  <Select placeholder="Choose an option" options={setting.bounds.values?.map((value) => ({ value,
                    label: optionLabel(value) + ((setting.key === "publicationMode" && value === "auto_publish") || (setting.key === "imageMode" && value === "automatic") ? " (not available)" : ""),
                    disabled: (setting.key === "publicationMode" && value === "auto_publish") || (setting.key === "imageMode" && value === "automatic"),
                  }))} />
                ) : setting.type === "integer" ? (
                  <InputNumber placeholder="Enter a number"
                    min={setting.bounds.min === undefined ? undefined : setting.bounds.min / (MONEY_LABELS[setting.key] ? 100 : 1)}
                    max={setting.bounds.max === undefined ? undefined : setting.bounds.max / (MONEY_LABELS[setting.key] ? 100 : 1)}
                    precision={MONEY_LABELS[setting.key] ? 2 : 0}
                    step={MONEY_LABELS[setting.key] ? 0.01 : 1}
                    addonAfter={MONEY_LABELS[setting.key] ? currency : undefined}
                    style={{ width: "100%", maxWidth: 320 }}
                  />
                ) : setting.key === "articleAuthorId" ? (
                  <AuthorSelect />
                ) : setting.key === "imageModel" ? (
                  <ImageModelSelect />
                ) : setting.key === "editorialStrategy" || setting.key === "disclosureText" ? (
                  <Input.TextArea placeholder="Enter text" maxLength={setting.bounds.max} rows={4} />
                ) : (
                  <Input placeholder="Enter a value" maxLength={setting.bounds.max} />
                )}
              </Form.Item>
            ))}
              </div>
            </SettingsSection>)}
            <StickyActions status={dirty ? "Unsaved changes" : "Settings are up to date"}>
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
            </StickyActions>
          </Form>
        </>
      )}
    </>
  );
}

/** The byline for AI-assisted articles: an existing, active author only; never invented (owner decision). */
function AuthorSelect(props: { value?: string; onChange?: (value: string) => void; id?: string }) {
  const [authors] = useAsync((signal) => blogApi().listAuthors({ status: "active" }, signal), []);
  return (
    <Select
      id={props.id}
      aria-label="Author of AI-assisted articles"
      allowClear
      placeholder="Not chosen: generation stays blocked"
      loading={authors.status === "loading"}
      value={props.value || undefined}
      onChange={(value) => props.onChange?.(value ?? "")}
      options={authors.status === "ready" ? authors.data.map((a) => ({ value: a.id, label: a.displayName })) : []}
      style={{ maxWidth: 420 }}
    />
  );
}

/**
 * The chosen provider's listed image models (the server's allowlist); the server still validates the pair.
 * A stored model the list does not show (for example after a provider change) stays visible so it can be corrected.
 */
function ImageModelSelect(props: { value?: string; onChange?: (value: string) => void; id?: string }) {
  const provider = Form.useWatch("imageProvider") as string | undefined;
  const [models] = useAsync(() => aiContentApi.imageModels(), []);
  const listed = models.status === "ready" ? models.data.filter((m) => m.provider === provider) : [];
  const options = listed.map((m) => ({ value: m.model, label: m.label }));
  if (props.value && !listed.some((m) => m.model === props.value)) options.unshift({ value: props.value, label: `${props.value} (not listed for this provider)` });
  return (
    <Select placeholder="Choose a listed model"
      id={props.id}
      aria-label="Image model"
      loading={models.status === "loading"}
      value={props.value || undefined}
      onChange={(value) => props.onChange?.(value)}
      options={options}
      notFoundContent={models.status === "error" ? "The model list could not be loaded" : "No model is listed for this provider"}
      style={{ maxWidth: 420 }}
    />
  );
}
