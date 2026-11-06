// Each story can pick who writes its replies, apart from the app's choice.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorytellerChoice, StorytellerInfo } from '../types';
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

const cloud = {
  id: 'p1',
  label: 'Cloud model',
  adapter: 'openai_compatible',
  baseUrl: 'https://api.example.com/v1',
  modelId: 'story-model',
  billing: 'paid',
  hasKey: true,
  settings: {},
  createdAt: '',
  updatedAt: '',
};
const app: StorytellerInfo = {
  profileId: 'p1',
  label: 'Cloud model',
  modelId: 'story-model',
  billing: 'paid',
};

describe("A story's own storyteller", () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
  });

  it('switches this story to the offline storyteller and back', async () => {
    const view = fakeRouteView();
    view.storyteller = app;
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_route_view':
          return view;
        case 'list_connections':
          return [cloud];
        case 'get_storyteller':
          return app;
        case 'set_story_storyteller': {
          const choice = args.choice as StorytellerChoice | null;
          return choice?.kind === 'offline'
            ? {
                profileId: null,
                label: 'Offline storyteller',
                modelId: null,
                billing: 'local',
                storyChoice: choice,
              }
            : app;
        }
        default:
          throw { code: 'NOT_FOUND', message: cmd };
      }
    });
    render(<ReaderScreen routeId="route-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cloud model' }));
    const dialog = await screen.findByRole('dialog', { name: 'Storyteller' });
    const same = await within(dialog).findByRole('radio', { name: /Same as the app/ });
    expect(same).toBeChecked();
    expect(same.closest('label')).toHaveTextContent('now Cloud model');

    await userEvent.click(within(dialog).getByRole('radio', { name: /Offline storyteller/ }));
    expect(invoke).toHaveBeenCalledWith('set_story_storyteller', {
      storyId: 'story-1',
      choice: { kind: 'offline' },
    });
    expect(await within(dialog).findByRole('radio', { name: /Offline storyteller/ })).toBeChecked();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Now: Offline storyteller');
    expect(screen.getByRole('button', { name: 'Offline storyteller' })).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('radio', { name: /Same as the app/ }));
    expect(invoke).toHaveBeenLastCalledWith('set_story_storyteller', {
      storyId: 'story-1',
      choice: null,
    });
  });
});
