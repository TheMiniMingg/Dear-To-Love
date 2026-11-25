// The story column keeps a reader's place while they re-read, but what the
// player does themselves (an action sent, a new chapter) brings it to the end.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NarrativeView } from '../features/reader/NarrativeView';
import type { EventDto } from '../types';

const base = {
  originRouteId: 'r',
  generationRunId: null,
  createdAt: '',
};
const ev = (id: string, kind: string, payload: object) =>
  ({ ...base, id, parentEventId: null, kind, payload }) as unknown as EventDto;

const chapter = ev('c1', 'chapter_start', { chapterInstanceId: 'c', ordinal: 1, title: 'One' });
const reply1 = ev('a1', 'assistant', { text: 'The lamp hums.' });
const reply2 = ev('a2', 'assistant', { text: 'Rain on the glass.' });
const action = ev('p1', 'player', { text: 'Look around' });
const chapter2 = ev('c2', 'chapter_start', { chapterInstanceId: 'd', ordinal: 2, title: 'Two' });

const sizes = ['scrollHeight', 'clientHeight'] as const;
beforeEach(() => {
  for (const k of sizes) {
    Object.defineProperty(HTMLElement.prototype, k, {
      configurable: true,
      get() {
        return k === 'scrollHeight' ? 2000 : 400;
      },
    });
  }
});
afterEach(() => {
  for (const k of sizes) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
});

describe('following the story', () => {
  it('keeps the place of a reader scrolled back, until they act', () => {
    const { rerender } = render(<NarrativeView events={[chapter, reply1]} playerName="Sam" />);
    const column = screen.getByTestId('narrative');
    column.scrollTop = 100;
    fireEvent.scroll(column);

    rerender(<NarrativeView events={[chapter, reply1, reply2]} playerName="Sam" />);
    expect(column.scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument();

    rerender(<NarrativeView events={[chapter, reply1, reply2, action]} playerName="Sam" />);
    expect(column.scrollTop).toBe(2000);
  });

  it('a new chapter is shown from wherever the reader was', () => {
    const { rerender } = render(<NarrativeView events={[chapter, reply1]} playerName="Sam" />);
    const column = screen.getByTestId('narrative');
    column.scrollTop = 0;
    fireEvent.scroll(column);
    rerender(<NarrativeView events={[chapter, reply1, chapter2]} playerName="Sam" />);
    expect(column.scrollTop).toBe(2000);
  });
});
