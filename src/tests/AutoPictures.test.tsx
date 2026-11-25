// Pictures as the story goes: what a reply could have a picture of, the
// limits, reusing library pictures, and asking first or making them on
// their own.
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto, EventDto, ProviderProfile, RouteView } from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import {
  AUTO_DEFAULTS,
  libraryMatch,
  limitReached,
  loadLog,
  readLog,
  readSettings,
  storyOff,
  today,
  useAutoPictures,
  useAutoPictureSettings,
  wanted,
  type AutoLog,
} from '../features/reader/autoPictures';
import { AutoPictureCard } from '../features/reader/AutoPictureCard';
import { AutoPicturesSection } from '../features/settings/AutoPicturesSection';

function reply(id: string, text: string): EventDto {
  return {
    id,
    originRouteId: 'route-1',
    parentEventId: null,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind: 'assistant',
    payload: { text },
  } as EventDto;
}

function view(replies: EventDto[], location = 'The lamp room'): RouteView {
  const v = fakeRouteView(replies);
  v.state.state = {
    ...v.state.state,
    playerCharacterId: 'pc',
    characters: {
      pc: { id: 'pc', name: 'Sam Ashby' },
      mara: { id: 'mara', name: 'Mara Quill' },
      oren: { id: 'oren', name: 'Oren Vale' },
    },
    scene: { location, summary: '', participantIds: ['pc', 'mara', 'oren'], time: 'Dusk' },
    tracking: { meters: [], inventory: true, items: [{ name: 'Brass key', qty: 1 }] },
  } as unknown as RouteView['state']['state'];
  v.visuals = [{ slot: 'portrait:mara', assetId: 'img-mara' }];
  return v;
}

function image(id: string, label: string, tags: string[], shared = true, story?: string): AssetDto {
  return {
    id,
    mime: 'image/png',
    width: 10,
    height: 10,
    byteSize: 10,
    label,
    tags,
    createdAt: '2026-11-06T00:00:00Z',
    shared,
    stories: story ? [{ id: story, title: 'A story' }] : [],
    madeFrom: null,
  };
}

const painter = {
  id: 'pic',
  label: 'Pictures',
  billing: 'local',
} as unknown as ProviderProfile;

describe('what a story could have a picture of', () => {
  it('lists people without a portrait, the place, then items', () => {
    const v = view([reply('ev-2', '<scene place="The lamp room"/>\n\nOren arrives.')]);
    const all = { people: true, places: true, items: true };
    expect(wanted(v, all).map((w) => w.slot)).toEqual([
      'portrait:oren',
      'place:the lamp room',
      'item:brass key',
    ]);
    // Only the kinds chosen.
    expect(wanted(v, { people: false, places: true, items: false }).map((w) => w.slot)).toEqual([
      'place:the lamp room',
    ]);
  });

  it('leaves the opening place to the story’s background', () => {
    const v = view([reply('ev-2', '<scene place="The lamp room"/>\n\nRain.')]);
    v.visuals = [...(v.visuals ?? []), { slot: 'background', assetId: 'img-bg' }];
    const places = { people: false, places: true, items: false };
    expect(wanted(v, places)).toEqual([]);
    // Somewhere new is wanted, background or not.
    const moved = view(
      [
        reply('ev-2', '<scene place="The lamp room"/>\n\nRain.'),
        reply('ev-3', '<scene place="The cellar"/>\n\nDark.'),
      ],
      'The cellar',
    );
    moved.visuals = v.visuals;
    expect(wanted(moved, places).map((w) => w.name)).toEqual(['The cellar']);
  });
});

describe('limits', () => {
  const log = (made: number, lastReply: number | null, todayCount = 0): AutoLog => ({
    stories: { s: { made, lastReply, done: [] } },
    day: today(),
    today: todayCount,
  });
  it('stop at the number per story, per day, and between pictures', () => {
    const s = { ...AUTO_DEFAULTS, perStory: 2, perDay: 3, gap: 3 };
    expect(limitReached(s, log(0, null), 's', 1)).toBeNull();
    expect(limitReached(s, log(2, null), 's', 1)).toBe('story');
    expect(limitReached(s, log(0, null, 3), 's', 1)).toBe('day');
    expect(limitReached(s, log(1, 4), 's', 6)).toBe('gap');
    expect(limitReached(s, log(1, 4), 's', 7)).toBeNull();
    // 0 is no limit.
    expect(limitReached({ ...s, perStory: 0, perDay: 0 }, log(99, null, 99), 's', 1)).toBeNull();
  });

  it('read back from storage safely; yesterday’s count starts again', () => {
    expect(readSettings({ mode: 'nope', perStory: -1, gap: 0, style: 'oil' })).toEqual({
      ...AUTO_DEFAULTS,
      gap: 1,
    });
    expect(readSettings(null)).toEqual(AUTO_DEFAULTS);
    expect(readLog({ day: '2001-01-01', today: 9, stories: {} }).today).toBe(0);
    expect(
      readLog({ day: today(), today: 9, stories: { a: { made: 2, done: ['x', 3] } } }),
    ).toEqual({
      day: today(),
      today: 9,
      stories: { a: { made: 2, lastReply: null, done: ['x'], off: undefined } },
    });
  });
});

describe('library pictures are used again', () => {
  it('finds a portrait, place or item by name, this story’s own first', () => {
    const images = [
      image('shared-oren', 'Portrait of Oren Vale', ['Portrait', 'Made automatically']),
      image('own-oren', 'Portrait of Oren Vale', ['Portrait'], false, 'story-1'),
      image('other-oren', 'Oren Vale', ['Portrait'], false, 'story-2'),
      image('lamp', 'the lamp  room', ['Place']),
      image('key', 'Brass Key', ['Item'], false, 'story-1'),
    ];
    const v = view([]);
    const [oren, place, key] = wanted(v, { people: true, places: true, items: true });
    expect(libraryMatch(oren!, images, 'story-1')?.id).toBe('own-oren');
    expect(libraryMatch(oren!, images.slice(0, 1), 'story-1')?.id).toBe('shared-oren');
    // Another story's own pictures are never used.
    expect(libraryMatch(oren!, images.slice(2, 3), 'story-1')).toBeUndefined();
    expect(libraryMatch(place!, images, 'story-1')?.id).toBe('lamp');
    expect(libraryMatch(key!, images, 'story-1')?.id).toBe('key');
    expect(libraryMatch(key!, images, 'story-9')).toBeUndefined();
  });
});

describe('after a new reply', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    useAutoPictureSettings.setState({ settings: { ...AUTO_DEFAULTS } });
  });

  function setup(images: AssetDto[] = []) {
    const onMade = vi.fn();
    invoke.mockImplementation(
      async (cmd: string, args: { input?: { subject: { kind: string } } }) => {
        if (cmd === 'list_images') return images;
        if (cmd === 'make_story_picture') return image(`made-${args.input!.subject.kind}`, 'x', []);
        throw { code: 'NOT_FOUND', message: cmd };
      },
    );
    const first = view([reply('ev-2', 'Rain.')]);
    const hook = renderHook(({ v }) => useAutoPictures({ view: v, free: true, painter, onMade }), {
      initialProps: { v: first },
    });
    const next = view(
      [reply('ev-2', 'Rain.'), reply('ev-3', '<scene place="The cellar"/> Oren.')],
      'The cellar',
    );
    return { hook, onMade, next };
  }

  it('asks first: nothing is made until the player says so', async () => {
    const { hook, onMade, next } = setup();
    // Replies already there when the story opens are not looked at.
    expect(invoke).not.toHaveBeenCalledWith('make_story_picture', expect.anything());
    hook.rerender({ v: next });
    await waitFor(() => expect(hook.result.current.state.offer?.slot).toBe('portrait:oren'));
    expect(hook.result.current.state.replyId).toBe('ev-3');
    expect(invoke).not.toHaveBeenCalledWith('make_story_picture', expect.anything());
    await act(async () => hook.result.current.accept());
    await waitFor(() => expect(onMade).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('make_story_picture', {
      input: expect.objectContaining({
        subject: { kind: 'portrait', character: { id: 'oren', name: 'Oren Vale' } },
        storyId: 'story-1',
        share: true,
        style: 'painted',
      }),
    });
    expect(onMade.mock.calls[0]![1]).toMatchObject({ assetId: 'made-portrait', reused: false });
    const log = loadLog();
    expect(log.today).toBe(1);
    expect(log.stories['story-1']).toMatchObject({
      made: 1,
      lastReply: 2,
      done: ['portrait:oren'],
    });
  });

  it('makes them on its own, one per reply, using library pictures for free', async () => {
    useAutoPictureSettings.getState().change({ mode: 'auto' });
    const { hook, onMade, next } = setup([image('cellar', 'The cellar', ['Place'])]);
    hook.rerender({ v: next });
    await waitFor(() => expect(onMade).toHaveBeenCalledTimes(2));
    // The cellar came from the library; Oren's portrait was made.
    expect(onMade.mock.calls.map((c) => [c[1].want.slot, c[1].assetId, c[1].reused])).toEqual([
      ['place:the cellar', 'cellar', true],
      ['portrait:oren', 'made-portrait', false],
    ]);
    expect(loadLog().stories['story-1']?.made).toBe(1);
  });

  it('respects the limits and a story turned off', async () => {
    useAutoPictureSettings.getState().change({ mode: 'auto', perStory: 1 });
    localStorage.setItem(
      'dtl.autoPicturesLog',
      JSON.stringify({ day: today(), today: 0, stories: { 'story-1': { made: 1, done: [] } } }),
    );
    const { hook, next } = setup();
    hook.rerender({ v: next });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('list_images', undefined));
    expect(invoke).not.toHaveBeenCalledWith('make_story_picture', expect.anything());
    expect(hook.result.current.state.offer).toBeNull();
  });

  it('the card offers the picture; No pictures in this story turns it off', async () => {
    const { hook, next } = setup();
    hook.rerender({ v: next });
    await waitFor(() => expect(hook.result.current.state.offer).not.toBeNull());
    const r = hook.result.current;
    render(
      <AutoPictureCard
        state={r.state}
        painter={painter}
        onAccept={r.accept}
        onDecline={r.decline}
        onOffForStory={r.offForStory}
      />,
    );
    expect(screen.getByText('Make a portrait of Oren Vale?')).toBeVisible();
    expect(screen.getByText('(with Pictures, on this computer)')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'No pictures in this story' }));
    expect(storyOff('story-1')).toBe(true);
  });
});

describe('Settings → Pictures as the story goes', () => {
  beforeEach(() => {
    localStorage.clear();
    useAutoPictureSettings.setState({ settings: { ...AUTO_DEFAULTS } });
  });

  it('chooses how, what and how many, kept on this computer', async () => {
    render(<AutoPicturesSection hasPainter />);
    expect(screen.getByRole('radio', { name: /Ask me first/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Make them on their own/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Items you are given' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'At most per story' }), '5');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'How often' }), '1');
    expect(JSON.parse(localStorage.getItem('dtl.autoPictures')!)).toMatchObject({
      mode: 'auto',
      items: true,
      perStory: 5,
      gap: 1,
    });
    await userEvent.click(screen.getByRole('radio', { name: /Off/ }));
    expect(screen.getByRole('checkbox', { name: 'Items you are given' })).toBeDisabled();
  });
});
