// T23: arrow keys, buttons and the dropdown set the same value; focus stays put.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ArrowPicker } from '../components/ArrowPicker';

const OPTIONS = [
  { value: 'a', label: 'Harbor town', hint: 'Windy coast' },
  { value: 'b', label: 'Mountain pass' },
  { value: 'c', label: 'Night market' },
];

function Harness() {
  const [v, setV] = useState('a');
  return (
    <>
      <ArrowPicker label="World" options={OPTIONS} value={v} onChange={setV} />
      <output data-testid="value">{v}</output>
    </>
  );
}

describe('ArrowPicker', () => {
  it('changes value with Left/Right while focus stays on the dropdown', async () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'World' });
    select.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('value')).toHaveTextContent('b');
    expect(select).toHaveValue('b');
    expect(document.activeElement).toBe(select);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByTestId('value')).toHaveTextContent('c');
  });

  it('dropdown and buttons agree with the arrow value', async () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'World' });
    await userEvent.selectOptions(select, 'c');
    expect(screen.getByTestId('value')).toHaveTextContent('c');
    await userEvent.click(screen.getByRole('button', { name: 'Next World' }));
    expect(screen.getByTestId('value')).toHaveTextContent('a');
    expect(select).toHaveValue('a');
    expect(select).toHaveAccessibleDescription('Windy coast');
  });

  it('is one Tab stop; the step buttons are for pointer users', async () => {
    render(
      <>
        <button type="button">before</button>
        <Harness />
      </>,
    );
    screen.getByRole('button', { name: 'before' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'World' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(document.body);
  });
});
