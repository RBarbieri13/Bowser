// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { PageControls } from '../src/PageControls.jsx';

afterEach(cleanup);

test('keyboard disclosure preserves filter values while removing hidden controls from navigation', async () => {
  const user = userEvent.setup();
  render(<PageControls title="Research" summary={<span>2026 · Week 1</span>}>
    <label>Player search<input defaultValue="" /></label>
    <label>Position<select defaultValue="ALL"><option>ALL</option><option>RB</option></select></label>
  </PageControls>);
  const toggle = screen.getByRole('button', {name:'Filters & settings'});
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByText('2026 · Week 1')).toBeVisible();
  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard('{Enter}');
  await user.type(screen.getByRole('textbox'), 'Gibbs');
  await user.selectOptions(screen.getByRole('combobox'), 'RB');
  await user.click(toggle);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.keyboard(' ');
  expect(screen.getByRole('textbox')).toHaveValue('Gibbs');
  expect(screen.getByRole('combobox')).toHaveValue('RB');
});

test('source failures and primary actions stay visible while controls are collapsed', () => {
  render(<PageControls title="Market Pulse" actions={<button>Refresh data</button>} notices={<p role="alert">Provider unavailable; saved data retained.</p>}>
    <label>Sleeper window<select><option>24 hours</option></select></label>
  </PageControls>);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', {name:'Refresh data'})).toBeVisible();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
