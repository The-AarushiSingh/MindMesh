import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, test, expect, vi } from 'vitest';
import App from './App.jsx';

const jsonResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test('password visibility stays hidden until the control is used and keeps the value', async () => {
  const user = userEvent.setup();
  render(<App />);

  const input = screen.getByLabelText('Password');
  expect(input).toHaveAttribute('type', 'password');

  await user.type(input, 'Archive1!test');
  await user.click(screen.getByRole('button', { name: 'Show password' }));

  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('Archive1!test');

  await user.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveValue('Archive1!test');
});

test('registration shows verification instead of signing in, and resend can cool down', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    if (String(url).endsWith('/auth/register')) {
      return jsonResponse(201, {
        message: 'Account created. No email was sent because email delivery is in development mode.',
        emailDelivery: 'development',
        devCode: '123456',
        verificationRequired: true,
      });
    }
    if (String(url).endsWith('/auth/resend-verification')) {
      return jsonResponse(429, {
        message: 'Please wait before requesting another code.',
        code: 'RESEND_COOLDOWN',
        retryAfterSeconds: 45,
      });
    }
    return jsonResponse(500, { message: `Unexpected ${options.method || 'GET'} ${url}` });
  }));

  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Register' }));
  await user.type(screen.getByLabelText('Name'), 'A Reader');
  await user.type(screen.getByLabelText('Email'), 'reader@example.com');
  await user.type(screen.getByLabelText('Password'), 'Archive1!test');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByText(/Development mode: no email was sent/)).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
  expect(screen.getByRole('button', { name: /Resend code in/ })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Back to login' }));
  expect(screen.getByRole('button', { name: 'Enter archive' })).toBeInTheDocument();
});

test('login tells an unverified account to verify and does not store a session', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).endsWith('/auth/login')) {
      return jsonResponse(403, {
        message: 'Verify your email before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    return jsonResponse(500, { message: 'Unexpected request' });
  }));

  render(<App />);
  await user.type(screen.getByLabelText('Email'), 'reader@example.com');
  await user.type(screen.getByLabelText('Password'), 'Archive1!test');
  await user.click(screen.getByRole('button', { name: 'Enter archive' }));

  expect(await screen.findByText('Verify your email before signing in.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(localStorage.getItem('mindmesh-token')).toBeNull();
});
