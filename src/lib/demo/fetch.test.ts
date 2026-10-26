import { describe, expect, it } from "vitest";
import { createClient } from "../outseta/client";
import { AccountStage, CaseHistoryType, CaseStatus } from "../outseta/types";
import { buildDemoData, DEMO_AGENT_UID } from "./data";
import { createDemoFetch } from "./fetch";

function demoClient() {
  const data = buildDemoData(new Date("2026-10-26T12:00:00Z"));
  const client = createClient({ subdomain: "demo", apiKey: "any", secretKey: "any" }, { fetch: createDemoFetch(data) });
  return { data, client };
}

describe("demo data", () => {
  it("covers every account stage", () => {
    const stages = new Set(buildDemoData().accounts.map((a) => a.AccountStage));
    const all = Object.values(AccountStage).filter((v): v is AccountStage => typeof v === "number");
    expect([...stages].sort()).toEqual(all.sort());
  });

  it("links every person and case to records that exist", () => {
    const { accounts, people, cases } = buildDemoData();
    const accountUids = new Set(accounts.map((a) => a.Uid));
    const personUids = new Set(people.map((p) => p.Uid));
    for (const person of people) for (const uid of person.accountUids) expect(accountUids).toContain(uid);
    for (const c of cases) expect(personUids).toContain(c.FromPerson?.Uid);
  });

  it("only uses reserved example domains", () => {
    for (const person of buildDemoData().people) expect(person.Email).toMatch(/\.example$/);
  });
});

describe("createDemoFetch", () => {
  it("searches people by name or email and pages results", async () => {
    const { client } = demoClient();
    expect((await client.searchPeople({ query: "okafor" })).items.map((p) => p.FullName)).toEqual(["Grace Okafor"]);
    expect((await client.searchPeople({ query: "atlas.example" })).items).toHaveLength(3);

    const first = await client.searchPeople({ pageSize: 5 });
    const second = await client.searchPeople({ pageSize: 5, page: 1 });
    expect(first.hasMore).toBe(true);
    expect(second.items[0]?.Uid).not.toBe(first.items[0]?.Uid);
  });

  it("returns a person with their accounts and an account with its members", async () => {
    const { client } = demoClient();
    const person = await client.getPerson("person-lucas-martin");
    expect(person.PersonAccount?.map((link) => [link.Account?.Name, link.IsPrimary])).toEqual([
      ["Quartz Design Co", true],
      ["Northwind Studio", false],
    ]);

    const account = await client.getAccount("acct-atlas");
    expect(account.CurrentSubscription?.Quantity).toBe(14);
    expect(account.PersonAccount?.map((link) => link.Person?.FullName)).toContain("Grace Okafor");
  });

  it("applies the case filters the Support Cases command sends", async () => {
    const { client } = demoClient();
    const unassigned = await client.searchCases({
      filters: { Status: CaseStatus.Open, AssignedToPersonClientIdentifier__isnull: "true" },
    });
    expect(unassigned.items.every((c) => c.Status === CaseStatus.Open && !c.AssignedToPersonClientIdentifier)).toBe(
      true,
    );

    const mine = await client.searchCases({
      filters: { Status: CaseStatus.Open, AssignedToPersonClientIdentifier: DEMO_AGENT_UID },
    });
    expect(mine.items.map((c) => c.Subject)).toEqual([
      "Adding 6 more seats before Monday",
      "CSV export missing custom fields",
    ]);

    const closed = await client.searchCases({ filters: { Status: CaseStatus.Closed } });
    expect(closed.items).toHaveLength(3);
    expect(closed.items[0]).not.toHaveProperty("CaseHistories");
  });

  it("stores replies in memory", async () => {
    const { client } = demoClient();
    const before = await client.getCase("case-webhook");
    await client.replyToCase(before, "<p>Five times.</p>", "Alex");

    const after = await client.getCase("case-webhook");
    expect(after.CaseHistories?.at(-1)).toMatchObject({
      Type: CaseHistoryType.AgentReply,
      AgentName: "Alex",
      Comment: "<p>Five times.</p>",
    });
    expect(after.LastActivity! > before.LastActivity!).toBe(true);
  });

  it("answers unknown records with 404", async () => {
    const { client } = demoClient();
    await expect(client.getPerson("nobody")).rejects.toMatchObject({ status: 404 });
  });
});
