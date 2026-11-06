import type { EventDto, RouteView } from '../types';

/** Minimal route view for UI tests; only fields the screens read are realistic. */
export function fakeRouteView(extra: EventDto[] = []): RouteView {
  const chapter: EventDto = {
    id: 'ev-1',
    originRouteId: 'route-1',
    parentEventId: null,
    generationRunId: null,
    createdAt: '2026-11-06T00:00:00Z',
    kind: 'chapter_start',
    payload: { chapterInstanceId: 'ch-1', title: 'The Lamp Room', ordinal: 1 },
  };
  const history = [chapter, ...extra];
  const head = history[history.length - 1]!;
  const route = {
    id: 'route-1',
    storyId: 'story-1',
    label: 'Main',
    parentRouteId: null,
    forkEventId: null,
    headEventId: head.id,
    isMain: true,
    hidden: false,
    version: history.length,
    createdAt: '2026-11-06T00:00:00Z',
    updatedAt: '2026-11-06T00:00:00Z',
  };
  return {
    story: { id: 'story-1', title: 'The Unsigned Letter', description: '' },
    route,
    routes: [route],
    history,
    chapters: [{ eventId: 'ev-1', chapterInstanceId: 'ch-1', title: 'The Lamp Room', ordinal: 1 }],
    state: {
      headEventId: head.id,
      stateHash: 'x',
      activeChapter: {
        eventId: 'ev-1',
        chapterInstanceId: 'ch-1',
        title: 'The Lamp Room',
        ordinal: 1,
      },
      state: {
        playerCharacterId: 'pc',
        characters: { pc: { id: 'pc', name: 'Sam Ashby' } },
      } as unknown as RouteView['state']['state'],
    },
    awaitingReply:
      head.kind === 'player' ? { inputEventId: head.id, activeRun: null, lastRun: null } : null,
    storyteller: { profileId: null, label: 'Offline storyteller', modelId: null, billing: 'local' },
  };
}
