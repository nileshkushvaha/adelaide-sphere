import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Col, Form, InputNumber, Row, Typography } from 'antd';
import { settingsGroupsApi, type SettingDeclaration, type SettingGroupMetadata } from '@/api/settings-groups';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, PageHeader, PageLoader, SettingsSection, StatusTag, StickyActions } from '@/components/ui';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/**
 * Security settings (SRS 1.2 SECS 001–008).
 *
 * The form is built from the server's declarations, so a setting cannot appear
 * here that the server does not enforce, and its bounds are the server's bounds.
 * Where a change has a consequence — signing people out, ending sessions — the
 * screen says so before it is saved, not after (SECS 006).
 *
 * This screen is the reference implementation for settings pages: grouped
 * sections, units on every number, the limit in plain language, a summary of
 * what the current values mean, and a save bar that stays in reach.
 */

/** The groups an administrator reads in, in the order they think about them. */
const SECTIONS: { key: string; title: string; description: string; keys: string[] }[] = [
  {
    key: 'sessions',
    title: 'Sessions',
    description: 'How long an administrator stays signed in, and on how many devices.',
    keys: ['sessionIdleMinutes', 'sessionAbsoluteHours', 'maxConcurrentSessions'],
  },
  {
    key: 'passwords',
    title: 'Passwords',
    description: 'What administrators may choose, and how long a reset link lasts.',
    keys: ['passwordMinLength', 'passwordHistoryDepth', 'passwordResetMinutes'],
  },
  {
    key: 'login',
    title: 'Sign-in protection',
    description: 'What happens after repeated failed sign-ins.',
    keys: ['loginMaxFailedAttempts', 'loginBlockMinutes'],
  },
];

export function SecuritySettingsPage() {
  useDocumentTitle('Security settings');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [state, reload] = useAsync(async () => {
    const [registry, values] = await Promise.all([settingsGroupsApi.registry(), settingsGroupsApi.values('security')]);
    const group = registry.find((entry) => entry.key === 'security') ?? null;
    return { group, values };
  }, []);

  const mayUpdate = can(PERMISSION.securitySettingsUpdate);
  const group: SettingGroupMetadata | null = state.status === 'ready' ? state.data.group : null;
  const stored = state.status === 'ready' ? state.data.values.values : null;

  useEffect(() => {
    // Only the form is synchronised here. "Unsaved" is decided by comparing the
    // fields with the values that were loaded, in the handlers below, so a
    // reload does not have to reach back into state from inside an effect.
    if (state.status === 'ready') form.setFieldsValue(state.data.values.values);
  }, [state, form]);

  const byKey = useMemo(() => new Map((group?.settings ?? []).map((setting) => [setting.key, setting])), [group]);

  const save = async () => {
    if (state.status !== 'ready' || !state.data.group) return;
    const values = await form.validateFields();
    const changed = state.data.group.settings.filter((setting) => values[setting.key] !== state.data.values.values[setting.key]);
    const consequences = changed.map((setting) => setting.consequence).filter((line): line is string => Boolean(line));

    const apply = async () => {
      setSaving(true);
      setFormError(null);
      try {
        await settingsGroupsApi.update('security', state.data.values.version, values);
        message.success('Security settings saved. They apply to every administrator from their next request.');
        setDirty(false);
        reload();
      } catch (error) {
        // Field errors land on their own field; the envelope's message explains
        // the rest, including a version conflict when someone else has saved.
        const fields = fieldErrors(error);
        if (fields) form.setFields(Object.entries(fields).map(([name, errors]) => ({ name, errors })));
        setFormError(errorMessage(error));
      } finally {
        setSaving(false);
      }
    };

    if (consequences.length === 0) {
      await apply();
      return;
    }
    modal.confirm({
      title: 'Save these security settings?',
      width: 520,
      content: (
        <div>
          <Typography.Paragraph style={{ marginBottom: 8 }}>These changes take effect immediately:</Typography.Paragraph>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {consequences.map((line) => (
              <li key={line} style={{ marginBottom: 4 }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ),
      okText: 'Save security settings',
      cancelText: 'Keep editing',
      onOk: apply,
    });
  };

  /** One number, with what it counts beside it and its limit under it. */
  const field = (setting: SettingDeclaration) => (
    <Form.Item
      key={setting.key}
      label={setting.label}
      name={setting.key}
      extra={
        <span style={{ display: 'block', maxWidth: 420 }}>
          {setting.description}
          {setting.limitNote && ` ${setting.limitNote}`}
        </span>
      }
      rules={[
        { required: true, message: `Enter a value for ${setting.label.toLowerCase()}` },
        {
          type: 'number',
          min: setting.bounds.min,
          max: setting.bounds.max,
          message: `Enter a number between ${setting.bounds.min} and ${setting.bounds.max}`,
        },
      ]}
    >
      <InputNumber
        min={setting.bounds.min}
        max={setting.bounds.max}
        disabled={!mayUpdate}
        // The unit rides with the number: 30 on its own is not an instruction.
        // A suffix rather than `addonAfter`, which Ant has deprecated for this
        // control and warns about on every render.
        suffix={setting.unit ?? undefined}
        style={{ width: setting.unit ? 220 : 160 }}
      />
    </Form.Item>
  );

  const section = (keys: string[]) => {
    const settings = keys.map((key) => byKey.get(key)).filter((setting): setting is SettingDeclaration => Boolean(setting));
    return (
      <Row gutter={[24, 0]}>
        {settings.map((setting) => (
          <Col key={setting.key} xs={24} lg={12}>
            {field(setting)}
          </Col>
        ))}
      </Row>
    );
  };

  /** What the stored numbers add up to, said once in words. */
  const summaryFor = (key: string): string | null => {
    if (!stored) return null;
    const value = (name: string) => stored[name];
    if (key === 'sessions') {
      return `An administrator is signed out after ${value('sessionIdleMinutes')} minutes without activity, and after ${value('sessionAbsoluteHours')} hours in total. Each may be signed in on ${value('maxConcurrentSessions')} device${value('maxConcurrentSessions') === 1 ? '' : 's'} at once.`;
    }
    if (key === 'passwords') {
      const history = Number(value('passwordHistoryDepth'));
      // The current password is always refused by the server; the setting adds
      // how many before it are refused as well.
      const reuse = history === 0 ? 'A new password must differ from the current one.' : `A new password must differ from the current one and the ${history} before it.`;
      return `Passwords must be at least ${value('passwordMinLength')} characters. ${reuse} Reset links expire after ${value('passwordResetMinutes')} minutes.`;
    }
    if (key === 'login') {
      return `After ${value('loginMaxFailedAttempts')} failed sign-ins, further attempts are refused for ${value('loginBlockMinutes')} minutes.`;
    }
    return null;
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Security' }, { label: 'Security settings' }]}
        title="Security settings"
        description="Sign-in, password and session rules for all administrators."
      />

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      {formError && <Alert type="error" showIcon role="alert" message={formError} style={{ marginBottom: 20 }} />}
      {!mayUpdate && state.status === 'ready' && (
        <Alert type="info" showIcon message="You can see these settings but not change them." style={{ marginBottom: 20 }} />
      )}
      {state.status === 'loading' && <PageLoader label="Loading security settings" />}

      {state.status === 'ready' && group && (
        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          // Typing a value back to what it was is not an unsaved change.
          onValuesChange={() => {
            const current = form.getFieldsValue();
            setDirty(Object.keys(state.data.values.values).some((key) => current[key] !== state.data.values.values[key]));
          }}
        >
          {SECTIONS.map((entry) => (
            <SettingsSection key={entry.key} title={entry.title} description={entry.description} summary={summaryFor(entry.key)}>
              {section(entry.keys)}
            </SettingsSection>
          ))}

          <SettingsSection
            title="Two-factor authentication"
            description="An extra code from an authenticator app when signing in."
            status={<StatusTag status="optional" />}
          >
            <Typography.Paragraph style={{ marginBottom: 0, maxWidth: 640 }}>
              Administrators can turn on two-factor authentication for their own account from Account security. Requiring it for
              everyone is not switched on.
            </Typography.Paragraph>
            {group.note && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, maxWidth: 640, fontSize: 13 }}>
                {group.note}
              </Typography.Paragraph>
            )}
          </SettingsSection>

          {mayUpdate && (
            <StickyActions status={dirty ? 'You have unsaved changes.' : 'All changes saved.'}>
              <Button
                onClick={() => {
                  form.setFieldsValue(state.data.values.values);
                  setDirty(false);
                }}
                disabled={saving || !dirty}
              >
                Discard changes
              </Button>
              <Button type="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
                Save security settings
              </Button>
            </StickyActions>
          )}
        </Form>
      )}
    </div>
  );
}
