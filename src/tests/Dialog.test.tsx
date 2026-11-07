// Dialogs close on Escape, even when the focus was lost to the page (a
// focused button turned off while busy, or taken away).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../components/Dialog';

describe('Dialog', () => {
  it('closes on Escape inside it', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Pictures" onClose={onClose}>
        <button type="button">Make portrait</button>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Make portrait' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes only the top one on Escape when the focus is on the page', () => {
    const bottom = vi.fn();
    const top = vi.fn();
    render(
      <>
        <Dialog title="Paused" onClose={bottom}>
          <p>Menu</p>
        </Dialog>
        <Dialog title="Pictures" onClose={top}>
          <p>Choose a picture</p>
        </Dialog>
      </>,
    );
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).not.toHaveBeenCalled();
  });
});
