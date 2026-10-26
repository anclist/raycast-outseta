# Outseta for Raycast

Look up people and accounts, and triage support cases in your [Outseta](https://www.outseta.com) account without leaving Raycast.

## Commands

- **Search People** — find a person, see their account, plan, subscription status and last login.
- **Search Accounts** — find an account, see its plan, status, renewal date and members.
- **Support Cases** — browse unassigned, assigned-to-me, open or closed cases and reply to them.

## Setup

1. In Outseta, go to **Settings → Integrations → API Keys** and create a key.
2. Open the extension preferences in Raycast and fill in your subdomain, API key and secret key.
3. Set your agent name: customers see it as the sender of your replies.

To use the "Assigned to Me" filter in Support Cases, run "This Is Me" on any case assigned to you.

Set the subdomain to `demo` to try the extension with sample data, no Outseta account needed.

> Outseta API keys have full admin access. The extension only writes when you send a support reply, and always asks for confirmation first.

Windows support is declared but untested — please report if it works for you.

## Roadmap

- Multiple Outseta accounts
- Admin actions: create people, change plans, manage email lists
- Change case status
- Combined search across people, accounts and cases
- Menu bar metrics
- Knowledge base articles
- Markdown replies
- Estimated MRR

## Development

```sh
npm install
npm run dev     # run in Raycast
npm test        # unit tests
npm run lint
```

Raw API responses saved during development go in `fixtures/raw/` (gitignored). Only scrubbed fixtures in `fixtures/` are committed.
