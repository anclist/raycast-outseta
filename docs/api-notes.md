# Outseta API notes

Findings from probing a real account (2026-10-26) that the public docs don't cover.

## Agent replies

`POST /api/v1/support/cases/{caseUid}/replies`

- Body: `{ "Comment": "<p>html</p>", "AgentName": "Name" }`. `Type` defaults to `6` (AgentReply).
- Without `AgentName` the API returns `500` with an empty body.
- `AgentName` is free text. It is shown as the reply author in the admin UI and as the sender
  display name of the email to the customer.
- Success returns `200` with an empty body.
- The customer is emailed whether or not the case is assigned.
- Replies posted right after a case was moved out of Spam were stored but not emailed. Don't
  offer replies on Spam cases.

## Assignment

- `AssignedToPersonClientIdentifier` holds the agent's uid. Agents are not CRM people in the
  account (`GET /crm/people/{agentUid}` is 404) and there is no endpoint that lists agents.
- Filtering works: `GET /support/cases?AssignedToPersonClientIdentifier={agentUid}`.
- `PUT /support/cases/{uid}` with `{ "AssignedToPersonClientIdentifier": null }` unassigns.

## Admin deep links

- Person: `https://{subdomain}.outseta.com/#/app/crm/people/{uid}`
- Account: `https://{subdomain}.outseta.com/#/app/crm/accounts/{uid}`
- Case: `https://{subdomain}.outseta.com/#/app/support/tickets/{uid}`

## Enums

- Case `Status`: 1 Open, 2 Closed, 3 Spam
- Case `Source`: 1 Website, 2 Email, 3 Facebook, 4 Twitter, 5 Chat
- CaseHistory `Type`: 1 PersonReply, 2 Note, 3 Closed, 4 Reopened, 5 Assigned, 6 AgentReply,
  7 AutoReply, 8 ContactChange
- Account `AccountStage` comes with a ready-made `AccountStageLabel`.

## Other

- Emailing the support address creates a CRM person for the sender (counts toward the contact
  limit).
- No rate-limit headers are returned.
- Subscription pricing: `CurrentSubscription.Rate` and `BillingRenewalTerm`; plans carry
  `MonthlyRate`, `AnnualRate`, `QuarterlyRate`, `OneTimeRate`.
- `DELETE /support/cases/{uid}` and `DELETE /crm/people/{uid}` return `200`; the record then reads
  back as `404`. Used to remove the test case and the person its email created.

## Development write guard

Raycast doesn't pass shell environment variables to extensions, so in development builds writes
are allowed only for cases added with the dev-only "Allow Replies to This Case (Dev)" action
(stored in LocalStorage). `scripts/reply-test.ts` runs outside Raycast and still uses
`OUTSETA_WRITE_ALLOWLIST`.
