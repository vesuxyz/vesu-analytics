# Project

Vesu Analytics — analytics dashboard for the Vesu lending protocol on Starknet.

## Stack

- Next.js 16, Tailwind, Recharts
- Data sources: Vesu API, Starknet RPC (Alchemy), AVNU quotes API
- Deployment: Vercel (filesystem is read-only in production)

## Development

- RPC is configured via `ALCHEMY_RPC_URL` in `.env.local`
- Run `npx tsx scripts/index-holders.ts` to update the holders snapshot incrementally
- Load env vars with `export $(grep -v '^#' .env.local | xargs)` before running scripts

## Git

- Do not append "Co-Authored-By" lines to commit messages.
- Do not commit without being asked.
- Git user: nbundi / nbundi@proton.me

## Code style

- Keep responses concise, no trailing summaries.
- Don't add comments, docstrings, or type annotations to unchanged code.
- Test UI changes in the browser before reporting done.
