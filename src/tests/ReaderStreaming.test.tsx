// Live replies in the reader: drafts stream in, Stop cancels, failures offer
// Retry and Change action, and a reply in progress is picked up on reopen.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto, RouteView, RunDto, StreamMessage } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

const action: EventDto = {
  id: 'ev-2',
  originRouteId: 'route-1',
  parentEventId: 'ev-1',
  generationRunId: null,
  createdAt: '2026-11-06T00:00:01Z',
  kind: 'player',
  payload: { text: 'Open the door' },
};
const reply: EventDto = {
  id: 'ev-3',
  originRouteId: 'route-1',
  parentEventId: 'ev-2',
  generationRunId: 'run-1',
  createdAt: '2026-11-06T00:00:02Z',
  kind: 'assistant',
  payload: { text: 'The door creaks open.' },
};

type Gen = {
  send: (m: StreamMessage) => void;
  resolve: (v: RouteView) => void;
  reject: (e: unknown) => void;
};

function waitingView(lastRun: RunDto | null) {
  const v = fakeRouteView([action]);
  v.awaitingReply = { inputEventId: 'ev-2', activeRun: null, lastRun };
  return v;
}

describe('Reader live replies', () => {
  let gen: Gen | null;

  beforeEach(() => {
    gen = null;
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
  });

  function backend(initial: RouteView) {
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_route_view':
          return initial;
        case 'submit_action':
          return { runId: 'run-1', view: fakeRouteView([action]) };
        case 'retry_reply':
          return { runId: 'run-2', view: fakeRouteView([action]) };
        case 'cancel_reply':
          gen?.reject({ code: 'CANCELLED', message: 'the reply was cancelled' });
          return null;
        case 'generate_reply': {
          const channel = args.onEvent as { onmessage: (m: StreamMessage) => void };
          return new Promise<RouteView>((resolve, reject) => {
            gen = { send: (m) => channel.onmessage(m), resolve, reject };
          });
        }
        default:
          throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
      }
    });
  }

  it('shows drafts while streaming, then the committed reply', async () => {
    backend(fakeRouteView());
    render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.click(box);
    await userEvent.keyboard('Open the door{Enter}');
    await vi.waitFor(() => expect(gen).not.toBeNull());
    act(() => {
      gen!.send({ type: 'delta', runId: 'run-1', seq: 1, text: 'The door ' });
      gen!.send({ type: 'delta', runId: 'run-1', seq: 2, text: 'creaks' });
    });
    expect(screen.getByTestId('reply-draft')).toHaveTextContent('The door creaks');
    // Nothing typed: the button would let the story go on, and waits too.
    expect(screen.getByRole('button', { name: 'Keep going' })).toBeDisabled();
    expect(screen.getByText(/is writing/)).toBeInTheDocument();
    await act(async () => gen!.resolve(fakeRouteView([action, reply])));
    expect(screen.queryByTestId('reply-draft')).not.toBeInTheDocument();
    expect(screen.getByText('The door creaks open.')).toBeInTheDocument();
  });

  it('Stop cancels; the action stays and can be retried', async () => {
    backend(fakeRouteView());
    render(<ReaderScreen routeId="route-1" />);
    const box = await screen.findByLabelText('What do you do?');
    await userEvent.click(box);
    await userEvent.keyboard('Open the door{Enter}');
    await vi.waitFor(() => expect(gen).not.toBeNull());
    // After cancelling, the reloaded view shows the cancelled attempt.
    const cancelled = waitingView({
      id: 'run-1',
      routeId: 'route-1',
      inputEventId: 'ev-2',
      providerProfileId: null,
      status: 'cancelled',
      errorCode: 'CANCELLED',
      createdAt: '',
      finishedAt: '',
      options: {},
    });
    backend(cancelled);
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('You stopped the reply.')).toBeInTheDocument();
    gen = null;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(invoke).toHaveBeenCalledWith('retry_reply', {
      storyId: 'story-1',
      routeId: 'route-1',
      expectedHeadId: 'ev-2',
    });
    await vi.waitFor(() => expect(gen).not.toBeNull());
    expect(invoke).toHaveBeenLastCalledWith(
      'generate_reply',
      expect.objectContaining({ runId: 'run-2' }),
    );
  });

  it('a failed attempt from earlier explains itself after reopening', async () => {
    backend(
      waitingView({
        id: 'run-1',
        routeId: 'route-1',
        inputEventId: 'ev-2',
        providerProfileId: 'p',
        status: 'interrupted',
        errorCode: 'RUN_INTERRUPTED',
        createdAt: '',
        finishedAt: '',
        options: {},
      }),
    );
    render(<ReaderScreen routeId="route-1" />);
    expect(await screen.findByText(/may still have cost a little/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change action' })).toBeInTheDocument();
    // Nothing typed: the button would let the story go on, and waits too.
    expect(screen.getByRole('button', { name: 'Keep going' })).toBeDisabled();
  });

  it('picks up a reply that is waiting to start when the reader opens', async () => {
    const v = fakeRouteView([action]);
    v.awaitingReply = {
      inputEventId: 'ev-2',
      lastRun: null,
      activeRun: {
        id: 'run-9',
        routeId: 'route-1',
        inputEventId: 'ev-2',
        providerProfileId: null,
        status: 'pending',
        errorCode: null,
        createdAt: '',
        finishedAt: null,
        options: {},
      },
    };
    backend(v);
    render(<ReaderScreen routeId="route-1" />);
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'generate_reply',
        expect.objectContaining({ runId: 'run-9' }),
      ),
    );
  });
});
