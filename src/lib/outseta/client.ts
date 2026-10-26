import { Account, Case, CaseStatus, Page, Person } from "./types";

// Kept free of @raycast/api imports so it can be unit tested with a stubbed fetch.

export interface Credentials {
  subdomain: string;
  apiKey: string;
  secretKey: string;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  /** Called before every write. Throw to block it (used to guard the real account in development). */
  guardWrite?: (description: string, caseUid: string) => void;
  /** Delay before retrying a 429, in ms. */
  retryDelayMs?: number;
}

export class OutsetaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OutsetaError";
  }
}

export class AuthError extends OutsetaError {
  constructor() {
    super("Outseta rejected the API key or secret key.", 401);
    this.name = "AuthError";
  }
}

export class RateLimitError extends OutsetaError {
  constructor() {
    super("Outseta rate limit reached. Try again in a moment.", 429);
    this.name = "RateLimitError";
  }
}

export interface ListParams {
  query?: string;
  page?: number;
  pageSize?: number;
  fields?: string;
  orderBy?: string;
  filters?: Record<string, string | number | null | undefined>;
}

// Child-object fields cap pages at 25; plain fields allow 100.
export const PERSON_LIST_FIELDS = "Uid,Email,FirstName,LastName,FullName,ProfileImageS3Url,LastLoginDateTime";
export const ACCOUNT_LIST_FIELDS = "Uid,Name,AccountStage,AccountStageLabel";
export const CASE_LIST_FIELDS =
  "Uid,Subject,Status,Source,SubmittedDateTime,LastActivity,AssignedToPersonClientIdentifier,FromPerson.Uid,FromPerson.Email,FromPerson.FullName";

export const PERSON_DETAIL_FIELDS = [
  "*",
  "PersonAccount.*",
  "PersonAccount.Account.*",
  "PersonAccount.Account.CurrentSubscription.*",
  "PersonAccount.Account.CurrentSubscription.Plan.*",
].join(",");
export const ACCOUNT_DETAIL_FIELDS = [
  "*",
  "CurrentSubscription.*",
  "CurrentSubscription.Plan.*",
  "PersonAccount.*",
  "PersonAccount.Person.Uid",
  "PersonAccount.Person.Email",
  "PersonAccount.Person.FullName",
].join(",");
export const CASE_DETAIL_FIELDS = "*,CaseHistories.*,FromPerson.Uid,FromPerson.Email,FromPerson.FullName";

export function createClient(credentials: Credentials, options: ClientOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const baseUrl = `https://${credentials.subdomain}.outseta.com/api/v1`;
  const authorization = `Outseta ${credentials.apiKey}:${credentials.secretKey}`;

  async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const response = await doFetch(baseUrl + path, {
      method,
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 || response.status === 403) throw new AuthError();
    if (response.status === 429) {
      if (retried) throw new RateLimitError();
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return request<T>(method, path, body, true);
    }
    if (!response.ok) {
      throw new OutsetaError(
        `Outseta returned ${response.status} for ${method} ${path.split("?")[0]}`,
        response.status,
      );
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function list<T>(path: string, params: ListParams): Promise<Page<T>> {
    const pageSize = params.pageSize ?? 25;
    const search = new URLSearchParams({ limit: String(pageSize), offset: String(params.page ?? 0) });
    if (params.query) search.set("q", params.query);
    if (params.fields) search.set("fields", params.fields);
    if (params.orderBy) search.set("orderBy", params.orderBy);
    for (const [key, value] of Object.entries(params.filters ?? {})) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }

    const result = await request<{ items?: T[]; metadata?: { total?: number; limit?: number; offset?: number } }>(
      "GET",
      `${path}?${search}`,
    );
    const items = result.items ?? [];
    const total = result.metadata?.total ?? items.length;
    // offset is a page index, not a record offset
    const appliedLimit = result.metadata?.limit ?? pageSize;
    const page = result.metadata?.offset ?? params.page ?? 0;
    return { items, total, hasMore: (page + 1) * appliedLimit < total };
  }

  function guard(description: string, caseUid: string) {
    options.guardWrite?.(description, caseUid);
  }

  return {
    searchPeople: (params: ListParams) =>
      list<Person>("/crm/people", { fields: PERSON_LIST_FIELDS, pageSize: 100, ...params }),
    searchAccounts: (params: ListParams) =>
      list<Account>("/crm/accounts", { fields: ACCOUNT_LIST_FIELDS, pageSize: 100, ...params }),
    searchCases: (params: ListParams) =>
      list<Case>("/support/cases", { fields: CASE_LIST_FIELDS, orderBy: "LastActivity DESC", ...params }),

    getPerson: (uid: string) =>
      request<Person>("GET", `/crm/people/${encodeURIComponent(uid)}?fields=${PERSON_DETAIL_FIELDS}`),
    getAccount: (uid: string) =>
      request<Account>("GET", `/crm/accounts/${encodeURIComponent(uid)}?fields=${ACCOUNT_DETAIL_FIELDS}`),
    getCase: (uid: string) =>
      request<Case>("GET", `/support/cases/${encodeURIComponent(uid)}?fields=${CASE_DETAIL_FIELDS}`),

    /** Posts an agent reply. Outseta emails it to the customer with agentName as the sender name. */
    async replyToCase(supportCase: Pick<Case, "Uid" | "Status">, comment: string, agentName: string) {
      if (supportCase.Status === CaseStatus.Spam) {
        throw new OutsetaError("Replies to spam cases are not emailed. Mark the case as not spam first.", 400);
      }
      if (!agentName.trim()) throw new OutsetaError("Set your agent name in the extension preferences.", 400);
      guard("reply to case", supportCase.Uid);
      await request<void>("POST", `/support/cases/${encodeURIComponent(supportCase.Uid)}/replies`, {
        Comment: comment,
        AgentName: agentName.trim(),
      });
    },
  };
}

export type OutsetaClient = ReturnType<typeof createClient>;
