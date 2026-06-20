import type { FormEvent, MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { PendingSubmitButton } from './PendingSubmitButton';

describe('PendingSubmitButton', () => {
  it('locks immediately after the first accepted click', async () => {
    const handleClick = vi.fn();
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await render(
      <form onSubmit={handleSubmit}>
        <PendingSubmitButton onClick={handleClick} pendingChildren="Working">
          Submit
        </PendingSubmitButton>
      </form>,
    );

    const button = page.getByRole('button', { name: 'Submit' });

    await userEvent.click(button);

    await expect.element(page.getByRole('button', { name: 'Working' })).toBeDisabled();

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables before a second user interaction can be accepted', async () => {
    const handleClick = vi.fn();
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await render(
      <form onSubmit={handleSubmit}>
        <PendingSubmitButton onClick={handleClick} pendingChildren="Working">
          Approve
        </PendingSubmitButton>
      </form>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Approve' }));

    await expect.element(page.getByRole('button', { name: 'Working' })).toBeDisabled();

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not lock when the click handler intentionally prevents submission', async () => {
    const handleClick = vi.fn((event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    });
    const handleSubmit = vi.fn();

    await render(
      <form onSubmit={handleSubmit}>
        <PendingSubmitButton onClick={handleClick} pendingChildren="Working">
          Validate
        </PendingSubmitButton>
      </form>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Validate' }));

    await expect.element(page.getByRole('button', { name: 'Validate' })).toBeEnabled();
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
