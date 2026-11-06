// What kind of story: the 18+ age check mirrors the app's own, story
// details edits carry genre, rating, themes and limits, and a new story
// opens with its premise and a hint instead of a blank page.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runErrorMessage } from '../api/commands';
import { namesAMinor } from '../features/create/ContentFields';
import { NarrativeView } from '../features/reader/NarrativeView';
import { diffState, editProblems } from '../features/reader/stateDiff';
import type { EventDto, StoryStateV1 } from '../types';

const state: StoryStateV1 = {
  schemaVersion: 1,
  playerCharacterId: 'pc',
  world: { era: '', setting: 'Larkport', description: '', rules: [] },
  narration: { perspective: 'second', detail: 'balanced', tone: 'Warm', pacing: 'normal' },
  characters: {
    pc: { id: 'pc', name: 'Sam', control: 'player', personality: [], goals: [], abilities: [] },
    rowan: {
      id: 'rowan',
      name: 'Rowan',
      control: 'npc',
      age: '34',
      personality: [],
      goals: [],
      abilities: [],
    },
  },
  relationships: [],
  knownFacts: [],
  scene: { location: 'The hotel lobby', summary: 'Rain outside.', participantIds: ['pc'] },
  openThreads: [],
  visualRefs: {},
};

describe('What kind of story', () => {
  it('recognizes ages under 18 the way the app does', () => {
    for (const age of ['17', '16 years old', 'teenager', 'a child', 'seventeen', 'Underage']) {
      expect(namesAMinor(age), age).toBe(true);
    }
    for (const age of [
      '18',
      '34',
      'mid-twenties',
      'twenty-one',
      'Adult',
      '',
      '1,200 years',
      'ancient',
    ]) {
      expect(namesAMinor(age), age).toBe(false);
    }
  });

  it('story details edits carry the content settings, cleaned', () => {
    const after: StoryStateV1 = {
      ...state,
      narration: {
        ...state.narration,
        genres: ['Romance', ' '],
        rating: 'mature',
        themes: ['slow burn', ''],
        limits: [],
      },
    };
    const { changes, lines } = diffState(state, after);
    expect(changes).toEqual([
      {
        op: 'setNarration',
        narration: {
          ...state.narration,
          genres: ['Romance'],
          rating: 'mature',
          themes: ['slow burn'],
        },
      },
    ]);
    expect(lines.map((l) => l.what)).toEqual([
      'Narration · Genre',
      'Narration · Content rating',
      'Narration · Themes',
    ]);
    expect(lines[1]).toMatchObject({ before: 'Not set', after: 'Mature' });
    // Blank entries alone change nothing.
    const blank = { ...state, narration: { ...state.narration, genres: [''], themes: [' '] } };
    expect(diffState(state, blank).changes).toEqual([]);
  });

  it('an adults-only story refuses characters under 18', () => {
    const adults = { ...state, narration: { ...state.narration, rating: 'explicit' as const } };
    expect(editProblems(adults)).toEqual([]);
    const young = {
      ...adults,
      characters: { ...adults.characters, rowan: { ...adults.characters.rowan!, age: '16' } },
    };
    expect(editProblems(young).join(' ')).toMatch(/Rowan is under 18/);
    const general = { ...young, narration: { ...young.narration, rating: 'general' as const } };
    expect(editProblems(general)).toEqual([]);
  });

  it('a reply stopped by a content filter or a full disk says why', () => {
    expect(runErrorMessage('CONTENT_FILTERED')).toMatch(/content filter.*local model/);
    expect(runErrorMessage('DISK_FULL')).toMatch(/disk is full.*Everything saved before is safe/);
  });

  it('a new story opens with its premise, the scene and a hint', () => {
    const chapter: EventDto = {
      id: 'ev-1',
      originRouteId: 'r',
      parentEventId: null,
      generationRunId: null,
      createdAt: '',
      kind: 'chapter_start',
      payload: { chapterInstanceId: 'c', ordinal: 1, title: 'Check-in' },
    } as unknown as EventDto;
    const intro = {
      premise: 'Two guests, one room.',
      location: 'The hotel lobby',
      scene: 'Rain outside.',
    };
    const { rerender } = render(
      <NarrativeView events={[chapter]} playerName="Sam" intro={intro} />,
    );
    const block = screen.getByTestId('story-intro');
    expect(block).toHaveTextContent('Two guests, one room.');
    expect(block).toHaveTextContent('The hotel lobby');
    expect(block).toHaveTextContent('Write what you do');

    const action = {
      ...chapter,
      id: 'ev-2',
      parentEventId: 'ev-1',
      kind: 'player',
      payload: { text: 'Look around' },
    } as unknown as EventDto;
    rerender(<NarrativeView events={[chapter, action]} playerName="Sam" intro={intro} />);
    expect(screen.getByTestId('story-intro')).toHaveTextContent('Two guests, one room.');
    expect(screen.queryByText(/Write what you do/)).toBeNull();
    expect(screen.queryByText('The hotel lobby')).toBeNull();
  });
});
