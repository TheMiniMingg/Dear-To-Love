// More presets: races and roles, and the compact multi-choice picker used
// for rules and personality.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MultiPicker } from '../features/create/fields';
import { PERSONALITIES, RACES, ROLES, RULES } from '../features/create/presets';

function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MultiPicker
        label="Rules the storyteller follows"
        presets={RULES}
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('presets', () => {
  it('offer peoples beyond humans, and many roles and traits', () => {
    for (const race of ['Orc', 'Goblin', 'Lizardfolk', 'Kobold', 'Catfolk', 'Android']) {
      expect(RACES).toContain(race);
    }
    expect(ROLES.length).toBeGreaterThan(50);
    expect(PERSONALITIES.length).toBeGreaterThan(40);
    const lower = [...RACES, ...ROLES].map((r) => r.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe('MultiPicker', () => {
  it('adds from the list, adds your own, and removes, without listing every rule', async () => {
    render(<Harness initial={['Monsters exist']} />);
    const group = screen.getByRole('group', { name: 'Rules the storyteller follows' });
    expect(within(group).queryAllByRole('checkbox')).toHaveLength(0);
    const menu = within(group).getByRole('combobox', {
      name: 'Add to rules the storyteller follows from the list',
    });
    expect(within(menu).queryByRole('option', { name: 'Monsters exist' })).toBeNull();
    await userEvent.selectOptions(menu, 'Everyone has a secret');
    await userEvent.type(
      within(group).getByRole('textbox', { name: /Add your own/ }),
      'Dragons are extinct{Enter}',
    );
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Monsters exist","Everyone has a secret","Dragons are extinct"]',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Remove Monsters exist' }));
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Everyone has a secret","Dragons are extinct"]',
    );
    // The same rule twice is ignored.
    await userEvent.type(
      within(group).getByRole('textbox', { name: /Add your own/ }),
      'dragons are extinct',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Everyone has a secret","Dragons are extinct"]',
    );
  });
});
