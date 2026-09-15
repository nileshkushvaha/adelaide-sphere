import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettingsPage } from '@/pages/security/SecuritySettingsPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const declaration = (
  key: string,
  label: string,
  min: number,
  max: number,
  options: { unit?: string; limitNote?: string; consequence?: string } = {},
) => ({
  key,
  label,
  description: `${label} description`,
  type: 'integer',
  bounds: { min, max },
  unit: options.unit ?? null,
  limitNote: options.limitNote ?? null,
  default: max,
  visibility: 'private',
  effect: 'runtime',
  viewPermission: 'security.settings.view',
  updatePermission: 'security.settings.update',
  invalidates: [],
  consequence: options.consequence ?? null,
});

const registry = [
  {
    key: 'security',
    label: 'Security',
    description: 'Authentication, password policy, login security and session settings.',
    owner: 'AuthModule',
    viewPermission: 'security.settings.view',
    updatePermission: 'security.settings.update',
    note: 'Two-factor authentication is available to administrators individually.',
    settings: [
      declaration('sessionIdleMinutes', 'Sign out after inactivity', 5, 30, {
        unit: 'minutes',
        limitNote: 'For security, this cannot be longer than 30 minutes.',
        consequence: 'Administrators idle for longer than the new limit are signed out on their next request.',
      }),
      declaration('sessionAbsoluteHours', 'Maximum session duration', 1, 12, { unit: 'hours' }),
      declaration('maxConcurrentSessions', 'Concurrent sessions per administrator', 1, 10, { unit: 'sessions' }),
      declaration('passwordMinLength', 'Minimum password length', 12, 64, { unit: 'characters' }),
      declaration('passwordHistoryDepth', 'Remember previous passwords', 0, 10, { unit: 'passwords' }),
      declaration('passwordResetMinutes', 'Password reset link expires after', 5, 30, { unit: 'minutes' }),
      declaration('loginMaxFailedAttempts', 'Failed sign-ins before temporary lock', 3, 5, { unit: 'attempts' }),
      declaration('loginBlockMinutes', 'Temporary lock duration', 15, 60, { unit: 'minutes' }),
    ],
  },
];

const values = {
  group: 'security',
  values: {
    sessionIdleMinutes: 30,
    sessionAbsoluteHours: 12,
    maxConcurrentSessions: 10,
    passwordMinLength: 12,
    passwordHistoryDepth: 0,
    passwordResetMinutes: 30,
    loginMaxFailedAttempts: 5,
    loginBlockMinutes: 15,
  },
  version: 1,
  updatedAt: '2026-09-07T10:00:00.000Z',
  updatedByAdminId: null,
};

/**
 * The form is generated from the server's declarations (SRS 1.2 SET 002), so
 * these check that what the server says is what the screen offers — and that it
 * is offered in the words an administrator can act on: a unit beside every
 * number, the limit in plain language, and the consequence before the save.
 */
describe('SecuritySettingsPage', () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; method: string; body: unknown }[] = [];

  beforeEach(() => {
    requests.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/admin/settings/registry')) return jsonResponse(200, { data: registry });
      if (url.includes('/admin/settings/security')) return jsonResponse(200, { data: values });
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const render = (permissions: string[]) =>
    renderWithProviders(<SecuritySettingsPage />, {
      initialEntries: ['/admin/security/settings'],
      authProvider: providerWithPermissions(permissions),
    });

  it('groups the settings and states each limit in words, without internal codes', async () => {
    render(['security.settings.view', 'security.settings.update']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Security settings' })).toBeInTheDocument();
    for (const heading of ['Sessions', 'Passwords', 'Sign-in protection', 'Two-factor authentication']) {
      expect(await screen.findByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
    expect(await screen.findByLabelText('Sign out after inactivity')).toHaveValue('30');
    expect(screen.getByText('For security, this cannot be longer than 30 minutes.', { exact: false })).toBeInTheDocument();
    // A specification code is a fact about us, not an instruction to the reader.
    expect(document.body.textContent).not.toMatch(/AUTH \d{3}|SEC \d{3}|SECS \d{3}|Bounded by/);
  });

  it('shows what every number counts, so no value is a bare digit', async () => {
    render(['security.settings.view', 'security.settings.update']);
    await screen.findByLabelText('Sign out after inactivity');

    for (const unit of ['minutes', 'hours', 'sessions', 'characters', 'passwords', 'attempts']) {
      expect(screen.getAllByText(unit).length).toBeGreaterThan(0);
    }
  });

  it('summarises what the stored values mean, in a sentence per group', async () => {
    render(['security.settings.view']);

    expect(await screen.findByText(/signed out after 30 minutes without activity/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/after 5 failed sign-ins, further attempts are refused for 15 minutes/i)).toBeInTheDocument();
  });

  it('keeps the save action out of reach until something is actually changed', async () => {
    render(['security.settings.view', 'security.settings.update']);
    const idle = await screen.findByLabelText('Sign out after inactivity');

    expect(screen.getByRole('button', { name: /save security settings/i })).toBeDisabled();
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();

    await userEvent.clear(idle);
    await userEvent.type(idle, '15');
    expect(await screen.findByText('You have unsaved changes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save security settings/i })).toBeEnabled();
  });

  it('states the consequence before saving a change that signs administrators out', async () => {
    render(['security.settings.view', 'security.settings.update']);
    const idle = await screen.findByLabelText('Sign out after inactivity');
    await userEvent.clear(idle);
    await userEvent.type(idle, '15');
    await userEvent.click(screen.getByRole('button', { name: /save security settings/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/signed out on their next request/i)).toBeInTheDocument();
    // The button says what it does, not "OK".
    expect(within(dialog).getByRole('button', { name: 'Save security settings' })).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('shows an administrator who may only read that they cannot change anything', async () => {
    render(['security.settings.view']);

    expect(await screen.findByText(/see these settings but not change them/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save security settings/i })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Sign out after inactivity')).toBeDisabled();
  });

  it('says what two-factor authentication does today rather than offering a control the server cannot enforce', async () => {
    render(['security.settings.view']);

    const section = (await screen.findByRole('heading', { level: 2, name: 'Two-factor authentication' })).closest('.ant-card')!;
    expect(within(section as HTMLElement).getByText(/Requiring it for everyone is not switched on/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(section as HTMLElement).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
