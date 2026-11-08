// The look of the app: themes for the app and for each story, name colours
// for the cast, and chapters that open like a book's.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, EventDto, StoryStateV1 } from '../types';
import { fakeRouteView } from './fakeBackend';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { storyTheme, themeForGenres, useApplyTheme, useLook } from '../app/look';
import { NarrativeView } from '../features/reader/NarrativeView';
import { StoryDetailsPanel } from '../features/reader/StoryDetailsPanel';
import { StoryLookDialog } from '../features/reader/ReaderRail';
import { RichText } from '../features/reader/RichText';
import {
  castColors,
  NAME_COLORS,
  nameColorFinder,
  NameColorsContext,
  strangerColor,
} from '../features/reader/nameColors';
import { diffState } from '../features/reader/stateDiff';
import { LookSection } from '../features/settings/LookSection';

const person = (id: string, name: string, extra: Partial<Character> = {}): Character => ({
  id,
  name,
  control: id === 'pc' ? 'player' : 'npc',
  personality: [],
  goals: [],
  abilities: [],
  ...extra,
});

const ev = (id: string, kind: EventDto['kind'], payload: object): EventDto =>
  ({
    id,
    originRouteId: 'route-1',
    parentEventId: null,
    generationRunId: null,
    createdAt: '2026-11-07T00:00:00Z',
    kind,
    payload,
  }) as EventDto;

function ThemeProbe() {
  useApplyTheme();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  useLook.setState({ theme: 'rose', fitGenre: true, stories: {}, open: null });
  delete document.documentElement.dataset.theme;
});

describe('themes', () => {
  it('suggests a theme from the first genre that has one', () => {
    expect(themeForGenres(['Horror', 'Romance'])).toBe('gothic');
    expect(themeForGenres(['Mystery'])).toBe('gothic');
    expect(themeForGenres(['Action', 'Fantasy'])).toBe('parchment');
    expect(themeForGenres(['Science fiction'])).toBe('neon');
    expect(themeForGenres(['Thriller'])).toBe('midnight');
    expect(themeForGenres(['slice of life'])).toBe('cafe');
    expect(themeForGenres(['Romance'])).toBe('rose');
    expect(themeForGenres(['Superhero', 'Action'])).toBeNull();
    expect(themeForGenres(undefined)).toBeNull();
  });

  it('gives a story its own look, else one that fits, else the app theme', () => {
    const look = { theme: 'parchment' as const, fitGenre: true, stories: {} };
    expect(storyTheme(look, 's1', ['Cyberpunk'])).toBe('neon');
    expect(storyTheme(look, 's1', ['Superhero'])).toBe('parchment');
    expect(storyTheme({ ...look, fitGenre: false }, 's1', ['Cyberpunk'])).toBe('parchment');
    expect(storyTheme({ ...look, stories: { s1: 'rose' } }, 's1', ['Cyberpunk'])).toBe('rose');
    expect(storyTheme({ ...look, stories: { s1: 'app' } }, 's1', ['Cyberpunk'])).toBe('parchment');
  });

  it('puts the app theme, or the open story’s, on the page', () => {
    render(<ThemeProbe />);
    expect(document.documentElement.dataset.theme).toBe('rose');
    act(() => useLook.getState().setOpen({ storyId: 's1', genres: ['Horror'] }));
    expect(document.documentElement.dataset.theme).toBe('gothic');
    act(() => useLook.getState().setOpen(null));
    expect(document.documentElement.dataset.theme).toBe('rose');
  });

  it('chooses the app theme in Settings and keeps it on this computer', async () => {
    render(
      <>
        <ThemeProbe />
        <LookSection />
      </>,
    );
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getByRole('radio', { name: /Rose/ })).toBeChecked();
    for (const name of [/Midnight/, /Parchment/, /Neon/, /Café/, /Gothic/]) {
      expect(within(group).getByRole('radio', { name })).toBeInTheDocument();
    }
    await userEvent.click(within(group).getByRole('radio', { name: /Midnight/ }));
    expect(document.documentElement.dataset.theme).toBe('midnight');
    expect(JSON.parse(localStorage.getItem('dtl.look') ?? '{}')).toMatchObject({
      theme: 'midnight',
    });
    const fit = screen.getByRole('checkbox', {
      name: 'Give each story a look that fits its genre',
    });
    expect(fit).toBeChecked();
    await userEvent.click(fit);
    expect(useLook.getState().fitGenre).toBe(false);
  });

  it('chooses one story’s look from the reader, and can go back to the default', async () => {
    useLook.getState().setOpen({ storyId: 's1', genres: ['Fantasy'] });
    render(
      <>
        <ThemeProbe />
        <StoryLookDialog storyId="s1" genres={['Fantasy']} onClose={() => undefined} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Fits the genre (Parchment)' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('parchment');
    await userEvent.click(screen.getByRole('radio', { name: 'Midnight' }));
    expect(useLook.getState().stories).toEqual({ s1: 'midnight' });
    expect(document.documentElement.dataset.theme).toBe('midnight');
    await userEvent.click(screen.getByRole('radio', { name: 'Fits the genre (Parchment)' }));
    expect(useLook.getState().stories).toEqual({});
  });

  it('ignores a damaged saved look', async () => {
    localStorage.setItem(
      'dtl.look',
      JSON.stringify({ theme: 'vapor', stories: { a: 'x', b: 'app' } }),
    );
    vi.resetModules();
    const fresh = await import('../app/look');
    expect(fresh.useLook.getState()).toMatchObject({
      theme: 'rose',
      fitGenre: true,
      stories: { b: 'app' },
    });
  });
});

describe('name colours', () => {
  it('gives each of the cast a different colour that stays with them', () => {
    const cast = [
      person('pc', 'Sam'),
      person('mina', 'Mina Cho'),
      person('rowan', 'Rowan Ellis'),
      person('theo', 'Theo'),
    ];
    const colors = castColors(cast, 'pc');
    expect(colors.get('pc')).toBeNull();
    const npc = ['mina', 'rowan', 'theo'].map((id) => colors.get(id));
    expect(new Set(npc).size).toBe(3);
    expect(castColors([...cast].reverse(), 'pc')).toEqual(colors);
  });

  it('keeps a colour someone chose, and no one else gets it', () => {
    const chosen = NAME_COLORS[3];
    const cast = [
      person('pc', 'Sam', { color: '#123abc' }),
      person('mina', 'Mina', { color: chosen }),
    ];
    for (let i = 0; i < 12; i++) cast.push(person(`npc-${i}`, `Extra ${i}`));
    const colors = castColors(cast, 'pc');
    expect(colors.get('pc')).toBe('#123abc');
    expect(colors.get('mina')).toBe(chosen);
    expect(
      [...colors.entries()]
        .filter(([, c]) => c === chosen)
        .map(([id]) => id)
        .slice(0, 1),
    ).toEqual(['mina']);
  });

  it('finds a speaker by first name, and colours strangers by name', () => {
    const view = fakeRouteView();
    view.state.state.characters = {
      pc: person('pc', 'Sam Ashby'),
      mina: person('mina', 'Mina Cho'),
    };
    const find = nameColorFinder(view);
    expect(find('Mina')).toBe(find('Mina Cho'));
    expect(find('Mina')).not.toBeNull();
    expect(find('Sam')).toBeNull();
    expect(find('Deputy Hale')).toBe(strangerColor('Deputy'));
  });

  it('colours script lines and card names by speaker', () => {
    render(
      <NameColorsContext.Provider value={(n) => (n.startsWith('Mina') ? '#00897b' : null)}>
        <RichText
          playerName="Sam"
          text={'Mina: "You remembered."\n\n<post from="Mina Cho">New sketch.</post>'}
        />
      </NameColorsContext.Provider>,
    );
    expect(screen.getByText('Mina:').style.getPropertyValue('--name')).toBe('#00897b');
    expect(screen.getByText('Mina Cho').style.getPropertyValue('--name')).toBe('#00897b');
  });

  it('changes a name colour in Story details', async () => {
    const view = fakeRouteView();
    const full: StoryStateV1 = {
      schemaVersion: 1,
      playerCharacterId: 'pc',
      world: { era: 'Present day', setting: 'Wrenmouth', description: '', rules: [] },
      narration: { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' },
      characters: { pc: person('pc', 'Sam'), mina: person('mina', 'Mina') },
      relationships: [],
      knownFacts: [],
      scene: { location: 'The lamp room', summary: '', participantIds: ['pc'] },
      openThreads: [],
      visualRefs: {},
    };
    view.state.state = full;
    render(
      <StoryDetailsPanel
        view={view}
        playerName="Sam"
        onApplied={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const picker = screen.getByRole('combobox', { name: 'Character' });
    await userEvent.selectOptions(picker, 'mina');
    const colors = screen.getByRole('group', { name: 'Name color' });
    expect(within(colors).getByRole('radio', { name: 'Automatic' })).toBeChecked();
    await userEvent.click(within(colors).getByRole('radio', { name: 'Teal' }));
    expect(screen.getByRole('button', { name: 'Review changes (1)' })).toBeInTheDocument();

    const before = full;
    const after = {
      ...before,
      characters: { ...before.characters, mina: { ...person('mina', 'Mina'), color: '#00897B' } },
    };
    const { changes, lines } = diffState(before, after);
    expect(changes).toEqual([
      { op: 'upsertCharacter', character: { ...person('mina', 'Mina'), color: '#00897b' } },
    ]);
    expect(lines.map((l) => l.what)).toEqual(['Mina · Name color']);
  });
});

describe('chapter openings', () => {
  const chapter = (id: string, ordinal: number, title: string) =>
    ev(id, 'chapter_start', { chapterInstanceId: id, title, ordinal });

  it('shows the number and title, and a drop cap on each chapter’s first reply only', () => {
    render(
      <NarrativeView
        playerName="Sam"
        events={[
          chapter('c1', 1, 'The Lamp Room'),
          ev('p1', 'player', { text: 'I light the lamp.' }),
          ev('a1', 'assistant', { text: 'The wick catches.\n\nShadows lean back.' }),
          ev('p2', 'player', { text: 'I wait.' }),
          ev('a2', 'assistant', { text: 'Nothing moves.' }),
          chapter('c2', 2, 'Chapter 2'),
          ev('a3', 'assistant', { text: '<scene place="Pier"/>\n\nFog rolls in.' }),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Chapter 1: The Lamp Room' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
    const caps = [...document.querySelectorAll('.drop-cap')].map((p) => p.textContent);
    expect(caps).toEqual(['The wick catches.', 'Fog rolls in.']);
  });

  it('leaves out the drop cap where it does not fit', () => {
    const { container } = render(
      <>
        <RichText playerName="Sam" dropCap text={'Mina: "Hello."'} />
        <RichText playerName="Sam" dropCap text={'「おはよう」と彼女は言った。'} />
        <RichText playerName="Sam" dropCap text={'"Morning," she says.'} />
        <RichText
          playerName="Sam"
          dropCap
          text={'<thought who="Mina">Oh.</thought>\n\nShe waves.'}
        />
      </>,
    );
    expect(container.querySelector('.drop-cap')).toBeNull();
  });
});
