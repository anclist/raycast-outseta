import { Action, ActionPanel, Color, environment, Icon, Keyboard, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise, useCachedState, useLocalStorage } from "@raycast/utils";
import { useState } from "react";
import { PersonView } from "./components/details";
import { ReplyForm } from "./components/reply-form";
import { adminUrl, caseMarkdown, caseStatusLabel, caseTitle, parseDate, personName } from "./lib/outseta/format";
import { Case, CaseSource, CaseStatus } from "./lib/outseta/types";
import { allowDevWrites, getClient, getSubdomain, showErrorToast } from "./lib/raycast";

type Filter = "unassigned" | "mine" | "open" | "closed";

function filterParams(filter: Filter, myUid: string | undefined): Record<string, string | number> {
  switch (filter) {
    case "unassigned":
      return { Status: CaseStatus.Open, AssignedToPersonClientIdentifier__isnull: "true" };
    case "mine":
      return { Status: CaseStatus.Open, AssignedToPersonClientIdentifier: myUid ?? "" };
    case "open":
      return { Status: CaseStatus.Open };
    case "closed":
      return { Status: CaseStatus.Closed };
  }
}

const sourceIcons: Record<CaseSource, Icon> = {
  [CaseSource.Website]: Icon.Globe,
  [CaseSource.Email]: Icon.Envelope,
  [CaseSource.Facebook]: Icon.Person,
  [CaseSource.Twitter]: Icon.Bird,
  [CaseSource.Chat]: Icon.SpeechBubble,
};

function shortcut(key: Keyboard.KeyEquivalent, shift = false): Keyboard.Shortcut {
  const extra: Keyboard.KeyModifier[] = shift ? ["shift"] : [];
  return { macOS: { modifiers: ["cmd", ...extra], key }, Windows: { modifiers: ["ctrl", ...extra], key } };
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useCachedState<Filter>("cases-filter", "unassigned");
  const [selectedUid, setSelectedUid] = useState<string>();
  // Agents aren't exposed by the API, so "me" is learned from a case the user says is assigned to them.
  const { value: myUid, setValue: setMyUid, isLoading: isLoadingMe } = useLocalStorage<string>("my-agent-uid");
  const effectiveFilter = filter === "mine" && !myUid ? "unassigned" : filter;

  const { data, isLoading, pagination, revalidate } = useCachedPromise(
    (query: string, activeFilter: Filter, me: string | undefined) => async (options: { page: number }) => {
      const page = await getClient().searchCases({
        query: query.trim() || undefined,
        page: options.page,
        filters: filterParams(activeFilter, me),
      });
      return { data: page.items, hasMore: page.hasMore };
    },
    [searchText, effectiveFilter, myUid],
    {
      execute: !isLoadingMe,
      keepPreviousData: true,
      onError: (error) => showErrorToast(error, "Couldn't load cases"),
    },
  );

  async function rememberMe(supportCase: Case) {
    const uid = supportCase.AssignedToPersonClientIdentifier;
    if (!uid) return;
    await setMyUid(uid);
    setFilter("mine");
    await showToast({ style: Toast.Style.Success, title: "Saved", message: '"Assigned to Me" now shows your cases' });
  }

  return (
    <List
      isLoading={isLoading || isLoadingMe}
      isShowingDetail={!!data?.length}
      onSearchTextChange={setSearchText}
      onSelectionChange={(id) => setSelectedUid(id ?? undefined)}
      searchBarPlaceholder="Search cases"
      throttle
      pagination={pagination}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter cases" value={effectiveFilter} onChange={(v) => setFilter(v as Filter)}>
          <List.Dropdown.Item title="Unassigned" value="unassigned" icon={Icon.Tray} />
          {myUid ? <List.Dropdown.Item title="Assigned to Me" value="mine" icon={Icon.Person} /> : null}
          <List.Dropdown.Item title="All Open" value="open" icon={Icon.Envelope} />
          <List.Dropdown.Item title="Closed" value="closed" icon={Icon.CheckCircle} />
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.CheckCircle}
        title={searchText ? "No matching cases" : "No cases here"}
        description={
          !myUid && !searchText
            ? 'To filter by "Assigned to Me", select a case assigned to you and run "This Is Me" (⌘⇧M).'
            : undefined
        }
      />
      {data?.map((supportCase) => (
        <CaseItem
          key={supportCase.Uid}
          supportCase={supportCase}
          selected={supportCase.Uid === selectedUid}
          myUid={myUid}
          onChanged={revalidate}
          onRememberMe={rememberMe}
        />
      ))}
    </List>
  );
}

function CaseItem(props: {
  supportCase: Case;
  selected: boolean;
  myUid: string | undefined;
  onChanged: () => void;
  onRememberMe: (supportCase: Case) => void;
}) {
  const { supportCase, myUid } = props;
  const {
    data: detail,
    isLoading,
    revalidate,
  } = useCachedPromise((uid: string) => getClient().getCase(uid), [supportCase.Uid], {
    execute: props.selected,
    onError: (error) => showErrorToast(error, "Couldn't load case"),
  });
  const full = detail ?? supportCase;
  const assignedToMe = !!myUid && supportCase.AssignedToPersonClientIdentifier === myUid;
  const lastActivity = parseDate(supportCase.LastActivity ?? supportCase.SubmittedDateTime);

  const accessories: List.Item.Accessory[] = [];
  if (assignedToMe)
    accessories.push({ icon: { source: Icon.Person, tintColor: Color.Blue }, tooltip: "Assigned to you" });
  if (supportCase.Status !== CaseStatus.Open) accessories.push({ tag: caseStatusLabel(supportCase.Status) });
  if (lastActivity) accessories.push({ date: lastActivity, tooltip: "Last activity" });

  const onSent = () => {
    revalidate();
    props.onChanged();
  };

  return (
    <List.Item
      id={supportCase.Uid}
      title={caseTitle(supportCase)}
      subtitle={personName(supportCase.FromPerson)}
      icon={supportCase.Source ? sourceIcons[supportCase.Source] : Icon.Envelope}
      accessories={accessories}
      detail={<List.Item.Detail isLoading={isLoading} markdown={detail ? caseMarkdown(full) : undefined} />}
      actions={
        <ActionPanel>
          {full.Status === CaseStatus.Spam ? null : (
            <Action.Push title="Reply" icon={Icon.Reply} target={<ReplyForm supportCase={full} onSent={onSent} />} />
          )}
          <Action.OpenInBrowser title="Open in Outseta" url={adminUrl(getSubdomain(), "case", supportCase.Uid)} />
          {full.FromPerson?.Uid ? (
            <Action.Push
              title="Show Customer"
              icon={Icon.Person}
              shortcut={shortcut("p", true)}
              target={<PersonView uid={full.FromPerson.Uid} />}
            />
          ) : null}
          {supportCase.AssignedToPersonClientIdentifier && !assignedToMe ? (
            <Action
              title="This Is Me"
              icon={Icon.PersonCircle}
              shortcut={shortcut("m", true)}
              onAction={() => props.onRememberMe(supportCase)}
            />
          ) : null}
          {environment.isDevelopment ? (
            <Action
              title="Allow Replies to This Case (Dev)"
              icon={Icon.LockUnlocked}
              onAction={async () => {
                await allowDevWrites(supportCase.Uid);
                await showToast({ style: Toast.Style.Success, title: "Replies allowed for this case" });
              }}
            />
          ) : null}
          <ActionPanel.Section>
            {full.FromPerson?.Email ? (
              <Action.CopyToClipboard
                title="Copy Customer Email"
                content={full.FromPerson.Email}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
            ) : null}
            <Action.CopyToClipboard
              title="Copy Case Link"
              content={adminUrl(getSubdomain(), "case", supportCase.Uid)}
              shortcut={Keyboard.Shortcut.Common.CopyDeeplink}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={onSent}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
