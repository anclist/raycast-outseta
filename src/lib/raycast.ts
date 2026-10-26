import { Color, environment, getPreferenceValues, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { AuthError, createClient, OutsetaClient } from "./outseta/client";
import { StatusColor } from "./outseta/format";

let client: OutsetaClient | undefined;

export function getSubdomain(): string {
  return getPreferenceValues<Preferences>().subdomain.trim().toLowerCase();
}

export function getClient(): OutsetaClient {
  if (!client) {
    const { apiKey, secretKey } = getPreferenceValues<Preferences>();
    client = createClient({ subdomain: getSubdomain(), apiKey: apiKey.trim(), secretKey }, { guardWrite });
  }
  return client;
}

// API keys have full admin access and the developer's only account is a live one, so in
// development every write must target a case listed in OUTSETA_WRITE_ALLOWLIST. If Raycast
// doesn't pass the variable through, all writes are blocked, which is the safe default.
function guardWrite(description: string, caseUid: string) {
  if (!environment.isDevelopment) return;
  const allowlist = (process.env.OUTSETA_WRITE_ALLOWLIST ?? "").split(",").filter(Boolean);
  if (!allowlist.includes(caseUid)) {
    throw new Error(`Development guard: ${description} blocked, ${caseUid} is not in OUTSETA_WRITE_ALLOWLIST.`);
  }
}

export function toRaycastColor(color: StatusColor): Color {
  switch (color) {
    case "green":
      return Color.Green;
    case "yellow":
      return Color.Yellow;
    case "orange":
      return Color.Orange;
    case "red":
      return Color.Red;
    default:
      return Color.SecondaryText;
  }
}

export async function showErrorToast(error: unknown, title = "Outseta request failed") {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AuthError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Invalid Outseta credentials",
      message,
      primaryAction: { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() },
    });
    return;
  }
  await showToast({ style: Toast.Style.Failure, title, message });
}
