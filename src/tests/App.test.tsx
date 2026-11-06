import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { App } from '../app/App';
import { useUiStore } from '../app/store';

describe('App shell', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: 'library' });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_app_info') {
        return {
          name: 'Dear to Love',
          version: '0.1.0',
          os: 'linux',
          arch: 'x86_64',
          buildProfile: 'debug',
        };
      }
      if (cmd === 'run_diagnostics') {
        return [
          {
            id: 'DATA_DIR',
            label: 'Data folder',
            status: 'FAIL',
            summary: 'Cannot write',
            remediation: 'Check permissions',
            durationMs: 1,
            checkedAt: '2026-11-06T00:00:00Z',
          },
        ];
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
  });

  it('shows the installed version in the footer', async () => {
    render(<App />);
    expect(await screen.findByText('v0.1.0')).toBeInTheDocument();
  });

  it('opens Diagnostics from the footer and shows results with remediation', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(await screen.findByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('Check permissions')).toBeInTheDocument();
  });

  it('passes deep=true only when the deep check is requested', async () => {
    useUiStore.setState({ screen: 'diagnostics' });
    render(<App />);
    await screen.findByText('FAIL');
    expect(invoke).toHaveBeenCalledWith('run_diagnostics', { deep: false });
    await userEvent.click(screen.getByRole('button', { name: 'Run deep check' }));
    await screen.findByText('FAIL');
    expect(invoke).toHaveBeenLastCalledWith('run_diagnostics', { deep: true });
  });

  it('shows a typed error when diagnostics cannot run', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'run_diagnostics') throw { code: 'INTERNAL', message: 'boom' };
      return { name: 'x', version: '0.1.0', os: 'linux', arch: 'x86_64', buildProfile: 'debug' };
    });
    useUiStore.setState({ screen: 'diagnostics' });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
