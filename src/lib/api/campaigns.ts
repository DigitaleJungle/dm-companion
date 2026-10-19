import { invoke } from "@tauri-apps/api/core";

/** Mirrors `Campaign` in src-tauri/src/commands/campaigns.rs. Times are ms since the Unix epoch. */
export type Campaign = { id: string; name: string; createdAt: number; lastOpenedAt: number };
export type CampaignList = { campaigns: Campaign[]; archived: Campaign[]; unreadable: string[] };

// All of these reject with a StorageError.
export function listCampaigns(): Promise<CampaignList> {
  return invoke("list_campaigns");
}

export function createCampaign(name: string): Promise<Campaign> {
  return invoke("create_campaign", { name });
}

/** Loads an active campaign and marks it as opened now. */
export function openCampaign(id: string): Promise<Campaign> {
  return invoke("open_campaign", { id });
}

export function renameCampaign(id: string, name: string): Promise<Campaign> {
  return invoke("rename_campaign", { id, name });
}

/** Moves the campaign to the archive, where it can be restored. */
export function archiveCampaign(id: string): Promise<void> {
  return invoke("archive_campaign", { id });
}

export function restoreCampaign(id: string): Promise<void> {
  return invoke("restore_campaign", { id });
}

/** Permanently deletes an archived campaign and all its data. */
export function deleteArchivedCampaign(id: string): Promise<void> {
  return invoke("delete_archived_campaign", { id });
}
