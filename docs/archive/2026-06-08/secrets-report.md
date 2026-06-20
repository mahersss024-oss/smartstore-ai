# Secrets Report

Generated: 2026-06-08

## Source scan result

A source scan for common secret patterns found placeholders and unit-test stubs only. Real local `.env`, `.env.local`, and `.env.production` files are ignored by Git.

## Rules in effect

- Server secrets are read through `Env`.
- AI provider keys are encrypted before storage.
- Platform AI client redacts `sk-*` style secrets from returned model text.
- Production env validation fails on missing required variables and placeholder-looking values.

## Required operator actions

- Rotate any secret that was pasted into chat or screenshots.
- Store real values only in Vercel/hosting provider environment variables.
- Keep `.env*` ignored.

