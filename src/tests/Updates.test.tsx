// Release UX: the opt-in update notice in the footer (T42, T43), the
// Settings switch and Check now (T44), the optional support link (T47) and
// the diagnostics report dialog (T50).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, UpdateStatus } from '../types';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {},
}));
const saveDialog = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: (...args: unknown[]) => saveDialog(...args),
}));

import { useUiStore } from '../app/store';
import { StatusFooter } from '../components/StatusFooter';
import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { AboutSection, UpdatesSection } from '../features/updates/UpdatesSection';

const info: AppInfo = {
  name: 'Dear to Love',
  version: '1.9.0',
  os: 'linux',
  arch: 'x86_64',
  buildProfile: 'release',
  repositoryUrl: 'https://github.com/TheMiniMingg/Dear-To-Love',
  supportUrl: null,
};

const off: UpdateStatus = {
  enabled: false,
  installed: '1.9.0',
  state: 'off',
  latest: null,
  checkedAt: null,
  message: null,
  acknowledged: null,
  showNotice: false,
};

const available = (version: string, acknowledged: string | null = null): UpdateStatus => ({
  ...off,
  enabled: true,
  state: 'available',
  latest: {
    version,
    url: `https://github.com/TheMiniMingg/Dear-To-Love/releases/tag/v${version}`,
    name: null,
    publishedAt: null,
  },
  checkedAt: '2026-11-06T12:00:00Z',
  acknowledged,
  showNotice: acknowledged !== version,
});

let status: UpdateStatus;
let appInfo: AppInfo;

beforeEach(() => {
  status = off;
  appInfo = info;
  useUiStore.setState({ updates: null });
  invoke.mockReset();
  saveDialog.mockReset();
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case 'get_app_info':
        return appInfo;
      case 'get_update_status':
        return status;
      case 'check_for_updates':
        return status;
      case 'set_update_checks':
        status = { ...status, enabled: args.enabled as boolean };
        return status;
      case 'acknowledge_update':
        status = { ...status, acknowledged: args.version as string, showNotice: false };
        return status;
      case 'open_release_page':
      case 'open_support_page':
      case 'open_repository_page':
      case 'open_issue_page':
        return null;
      case 'run_diagnostics':
        return [];
      case 'diagnostics_report':
        return 'Dear to Love diagnostics report\nVersion: v1.9.0 (linux x86_64, Release build)\n';
      case 'save_diagnostics_report':
        return 'Dear to Love diagnostics 2026-11-06.txt';
      default:
        throw { code: 'NOT_FOUND', message: cmd };
    }
  });
});

describe('Update notice', () => {
  it('stays hidden while checks are off and asks for no manual check', async () => {
    render(<StatusFooter />);
    expect(await screen.findByText('v1.9.0')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('check_for_updates', { manual: false });
    expect(screen.queryByRole('status', { name: 'Update available' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Support development' })).not.toBeInTheDocument();
  });

  it('shows a newer release until it is acknowledged (T42, T43)', async () => {
    status = available('1.10.0');
    render(<StatusFooter />);
    const notice = await screen.findByRole('status', { name: 'Update available' });
    expect(notice).toHaveTextContent('Dear to Love v1.10.0 is available.');

    await userEvent.click(within(notice).getByRole('button', { name: 'View release' }));
    expect(invoke).toHaveBeenCalledWith('open_release_page', undefined);

    await userEvent.click(
      within(notice).getByRole('button', { name: 'Hide the notice for v1.10.0' }),
    );
    expect(invoke).toHaveBeenCalledWith('acknowledge_update', { version: '1.10.0' });
    expect(screen.queryByRole('status', { name: 'Update available' })).not.toBeInTheDocument();
  });

  it('shows the support link only when one is configured (T47)', async () => {
    appInfo = { ...info, supportUrl: 'https://ko-fi.com/example' };
    render(<StatusFooter />);
    await userEvent.click(await screen.findByRole('button', { name: 'Support development' }));
    expect(invoke).toHaveBeenCalledWith('open_support_page', undefined);
  });
});

describe('Settings: updates and about', () => {
  it('is off by default; turning it on runs the daily check', async () => {
    render(<UpdatesSection />);
    const box = await screen.findByRole('checkbox', {
      name: 'Check GitHub for a new release once a day',
    });
    await vi.waitFor(() => expect(box).toBeEnabled());
    expect(box).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Update checks are off.');
    expect(invoke).not.toHaveBeenCalledWith('check_for_updates', expect.anything());

    invoke.mockClear();
    await userEvent.click(box);
    expect(invoke).toHaveBeenCalledWith('set_update_checks', { enabled: true });
    expect(invoke).toHaveBeenCalledWith('check_for_updates', { manual: false });
    expect(box).toBeChecked();
  });

  it('Check now reports a newer release, or a failure without fuss (T44)', async () => {
    render(<UpdatesSection />);
    const check = await screen.findByRole('button', { name: 'Check now' });
    await vi.waitFor(() => expect(check).toBeEnabled());

    status = available('1.10.0');
    await userEvent.click(check);
    expect(invoke).toHaveBeenCalledWith('check_for_updates', { manual: true });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'v1.10.0 is available; you have v1.9.0',
    );
    await userEvent.click(screen.getByRole('button', { name: 'View release v1.10.0' }));
    expect(invoke).toHaveBeenCalledWith('open_release_page', undefined);

    status = {
      ...status,
      state: 'unavailable',
      message: 'GitHub could not be reached',
      showNotice: false,
    };
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The last check did not work: GitHub could not be reached',
    );
    expect(screen.getByRole('status')).toHaveTextContent('newest release seen before was v1.10.0');
    expect(screen.queryByRole('button', { name: /View release/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('About shows the version and license and opens the repository', async () => {
    render(<AboutSection />);
    expect(await screen.findByText('v1.9.0')).toBeInTheDocument();
    expect(screen.getByText(/MIT License/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Source code' }));
    expect(invoke).toHaveBeenCalledWith('open_repository_page', undefined);
    expect(screen.queryByRole('button', { name: 'Support development' })).not.toBeInTheDocument();
  });
});

describe('Diagnostics report', () => {
  it('shows the report, copies it and saves it as a file (T50)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<DiagnosticsScreen />);
    const open = await screen.findByRole('button', { name: 'Copy report…' });
    await vi.waitFor(() => expect(open).toBeEnabled());
    await userEvent.click(open);

    const dialog = await screen.findByRole('dialog', { name: 'Diagnostics report' });
    const text = await within(dialog).findByRole('textbox', { name: 'Report text' });
    expect(text).toHaveValue(
      'Dear to Love diagnostics report\nVersion: v1.9.0 (linux x86_64, Release build)\n',
    );
    expect(invoke).toHaveBeenCalledWith('diagnostics_report', { deep: false });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy report' }));
    expect(writeText).toHaveBeenCalledWith(
      'Dear to Love diagnostics report\nVersion: v1.9.0 (linux x86_64, Release build)\n',
    );
    expect(within(dialog).getByRole('status')).toHaveTextContent('Copied.');

    saveDialog.mockResolvedValue('/home/me/report.txt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as file…' }));
    expect(invoke).toHaveBeenCalledWith('save_diagnostics_report', {
      path: '/home/me/report.txt',
      report: 'Dear to Love diagnostics report\nVersion: v1.9.0 (linux x86_64, Release build)\n',
    });
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Saved Dear to Love diagnostics 2026-11-06.txt.',
    );
  });
});

describe('Report a problem', () => {
  it("adds the player's words under the report, copies it and can open a new issue", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<StatusFooter />);
    await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'What happened?' }),
      'The reply stopped halfway.',
    );
    const report =
      'Dear to Love diagnostics report\nVersion: v1.9.0 (linux x86_64, Release build)\n\n' +
      'What happened\n-------------\nThe reply stopped halfway.\n';
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeEnabled(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(report);
    expect(within(dialog).getByRole('status')).toHaveTextContent('Paste it into an email');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy and open GitHub' }));
    expect(invoke).toHaveBeenCalledWith('open_issue_page', undefined);
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Paste it into the issue that opened in your browser.',
    );

    saveDialog.mockResolvedValue('/home/me/report.txt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save as file…' }));
    expect(invoke).toHaveBeenCalledWith('save_diagnostics_report', {
      path: '/home/me/report.txt',
      report,
    });
  });
});
