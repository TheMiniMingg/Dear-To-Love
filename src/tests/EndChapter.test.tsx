// End chapter: recap, edit, save, and the recap shown at the chapter break.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDto } from '../types';
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

const played: EventDto[] = [
  {
    id: 'ev-2',
    originRouteId: 'route-1',
    parentEventId: 'ev-1',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind: 'player',
    payload: { text: 'Hold the letter up to the lamp.' },
  },
  {
    id: 'ev-3',
    originRouteId: 'route-1',
    parentEventId: 'ev-2',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:02Z',
    kind: 'assistant',
    payload: { text: 'A gull crest shows in the paper.' },
  },
];

function ended(recap: string, title: string): EventDto {
  return {
    id: 'ev-4',
    originRouteId: 'route-1',
    parentEventId: 'ev-3',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:03Z',
    kind: 'chapter_start',
    payload: {
      chapterInstanceId: 'ch-2',
      title,
      ordinal: 2,
      ...(recap ? { previousChapterRecap: recap } : {}),
    },
  };
}

const draft = {
  chapterOrdinal: 1,
  chapterTitle: 'The Lamp Room',
  recap: 'Sam held the letter to the lamp and found a gull crest.',
  writtenBy: 'the offline storyteller',
  nextOrdinal: 2,
  nextTitle: 'Low Tide',
  nextTitleSuggested: false,
  headEventId: 'ev-3',
};

function backend(onDraft: () => Promise<unknown>) {
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === 'get_route_view') return fakeRouteView(played);
    if (cmd === 'get_budget_status') throw { code: 'NOT_FOUND', message: 'none' };
    if (cmd === 'list_bookmarks') return [];
    if (cmd === 'draft_chapter_recap') return onDraft();
    if (cmd === 'end_chapter') {
      return fakeRouteView([
        ...played,
        ended(args.recap as string, (args.nextTitle as string | null) ?? 'Low Tide'),
      ]);
    }
    throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
  });
}

async function openEndChapter() {
  render(<ReaderScreen routeId="route-1" />);
  await userEvent.click(await screen.findByRole('button', { name: 'End chapter' }));
  return screen.getByRole('dialog', { name: 'End chapter' });
}

describe('End chapter', () => {
  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ drafts: {} });
  });

  it('shows the recap to edit, then saves and starts the next chapter with it', async () => {
    backend(async () => draft);
    const dialog = await openEndChapter();
    const box = await within(dialog).findByLabelText('What happened in Chapter 1: The Lamp Room');
    expect(box).toHaveValue(draft.recap);
    expect(box).toHaveFocus();
    expect(within(dialog).getByText(/Written by the offline storyteller/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Chapter 2 title')).toHaveValue('Low Tide');
    // The outline's title: nothing says the storyteller thought of it.
    expect(within(dialog).queryByText(/suggests this from how the chapter ended/)).toBeNull();

    await userEvent.clear(box);
    await userEvent.type(box, 'Sam found a gull crest, the same as on the ferry office door.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and start Chapter 2' }));

    expect(invoke).toHaveBeenCalledWith('end_chapter', {
      storyId: 'story-1',
      routeId: 'route-1',
      expectedHeadId: 'ev-3',
      recap: 'Sam found a gull crest, the same as on the ferry office door.',
      nextTitle: 'Low Tide',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved "End of Chapter 1: The Lamp Room"');
    const recap = screen.getByRole('complementary', { name: 'Recap of Chapter 1' });
    expect(recap).toHaveTextContent('the same as on the ferry office door');
    expect(screen.getByRole('heading', { name: 'Chapter 2: Low Tide' })).toBeInTheDocument();
  });

  it("says when the next title is the storyteller's idea, until it is changed", async () => {
    backend(async () => ({ ...draft, nextTitle: 'The Ferry', nextTitleSuggested: true }));
    const dialog = await openEndChapter();
    const title = await within(dialog).findByLabelText('Chapter 2 title');
    expect(title).toHaveValue('The Ferry');
    expect(title).toHaveAccessibleDescription(
      'The storyteller suggests this from how the chapter ended. Change it if you like.',
    );
    await userEvent.type(title, ' at Dawn');
    expect(within(dialog).queryByText(/suggests this from how the chapter ended/)).toBeNull();
  });

  it('explains why a chapter with no reply cannot end yet', async () => {
    backend(async () => {
      throw {
        code: 'INVALID_INPUT',
        message:
          'nothing has happened in this chapter yet. Play at least one turn before ending it',
      };
    });
    const dialog = await openEndChapter();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Chapter 1 can't end yet. Nothing has happened in this chapter yet.",
    );
    expect(within(dialog).queryByRole('button', { name: /Save and start/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep playing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('end_chapter', expect.anything());
  });

  it('lets the player write the recap when the storyteller cannot', async () => {
    backend(async () => {
      throw { code: 'PROVIDER_ERROR', message: 'the AI service is not responding' };
    });
    const dialog = await openEndChapter();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "The recap couldn't be written. The AI service is not responding.",
    );
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText('What happened in Chapter 1: The Lamp Room'),
      'Sam read the letter.',
    );
    await userEvent.type(within(dialog).getByLabelText('Chapter 2 title'), 'The Ferry');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and start Chapter 2' }));
    expect(invoke).toHaveBeenCalledWith(
      'end_chapter',
      expect.objectContaining({ recap: 'Sam read the letter.', nextTitle: 'The Ferry' }),
    );
    expect(screen.getByRole('heading', { name: 'Chapter 2: The Ferry' })).toBeInTheDocument();
  });

  it('can skip the wait and write the recap by hand', async () => {
    let finish: (v: unknown) => void = () => undefined;
    backend(() => new Promise((r) => (finish = r)));
    const dialog = await openEndChapter();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Offline storyteller is writing a recap of Chapter 1: The Lamp Room…',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Write it myself' }));
    const box = within(dialog).getByLabelText('What happened in Chapter 1: The Lamp Room');
    expect(box).toHaveFocus();
    await userEvent.type(box, 'Mine.');
    finish(draft);
    await new Promise((r) => setTimeout(r, 0));
    expect(box).toHaveValue('Mine.');
    expect(within(dialog).getByRole('button', { name: 'Write a recap for me' })).toBeVisible();
  });
});
