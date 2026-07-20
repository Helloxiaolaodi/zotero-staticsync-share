import { cookies } from "next/headers";
import { cache } from "react";
import { createHash } from "crypto";
import { getSupabaseClient } from "@/lib/supabase";
import { getCookieName, deriveLiteratureItems } from "@/lib/share-client";
import type {
  SharedCollectionActionInsert,
  SharedCollectionActionRecord,
  SharedCollectionRecord,
  SharedLiteratureItem,
  CollaborationActionType,
} from "@/lib/types";

// Re-export all client-safe utilities for server components that already import from "@/lib/share"
export {
  formatDisplayDate,
  formatCreators,
  formatPublicationTitle,
  makeDoiUrl,
  getCookieName,
  deriveLiteratureItem,
  deriveLiteratureItems,
  validateActionType,
  parseDoiList,
  isValidDoi,
} from "@/lib/share-client";

const ACTIONS_TABLE = "shared_collection_actions";

export function signPassword(slug: string, password: string): string {
  return createHash("sha256").update(`${slug}:${password}`).digest("hex");
}

export async function hasShareAccess(slug: string, password?: string | null): Promise<boolean> {
  if (!password) return true;
  const store = await cookies();
  const cookie = store.get(getCookieName(slug));
  if (!cookie?.value) return false;
  return cookie.value === signPassword(slug, password);
}

export const fetchSharedCollectionBySlug = cache(async (slug: string): Promise<SharedCollectionRecord | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shared_collections")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load shared collection.");
  }

  return (data as SharedCollectionRecord | null) || null;
});

export async function insertShareAction(
  payload: SharedCollectionActionInsert,
): Promise<SharedCollectionActionRecord> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(ACTIONS_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create collaboration action.");
  }

  return data as SharedCollectionActionRecord;
}

export async function cancelPendingShareAction(actionId: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(ACTIONS_TABLE)
    .update({ processed: true })
    .eq("id", actionId)
    .eq("processed", false);

  if (error) {
    throw new Error(error.message || "Failed to cancel pending action.");
  }
}

export async function fetchActionById(actionId: number): Promise<SharedCollectionActionRecord | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(ACTIONS_TABLE)
    .select("*")
    .eq("id", actionId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SharedCollectionActionRecord;
}

/**
 * Directly update literature_data in shared_collections to apply a collaboration
 * action immediately, so the change is visible on the web without waiting for
 * the Zotero plugin to poll and re-sync.
 */
export async function applyActionToLiteratureData(
  slug: string,
  actionType: CollaborationActionType,
  itemKey?: string | null,
  reporterName?: string | null,
  reportDate?: string | null,
): Promise<void> {
  const supabase = getSupabaseClient();

  // Fetch current record
  const { data, error } = await supabase
    .from("shared_collections")
    .select("literature_data")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return;

  const items = (data.literature_data as SharedLiteratureItem[] | null) || [];
  if (!items.length) return;

  let modified = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // For add_by_doi actions, skip — these need Zotero to create the item
    // For actions targeting a specific item, match by key
    if (actionType !== "add_by_doi" && itemKey && item.key !== itemKey) continue;

    const tags = [...(item.tags || [])];

    switch (actionType) {
      case "claim":
        if (itemKey && item.key === itemKey) {
          if (!tags.includes("auto_claimed")) tags.push("auto_claimed");
          if (reporterName && !tags.some((t) => t.startsWith("claimed_by:")))
            tags.push(`claimed_by:${reporterName}`);
          if (reportDate && !tags.some((t) => t.startsWith("claim_date:")))
            tags.push(`claim_date:${reportDate}`);
          item.tags = tags;
          modified = true;
        }
        break;

      case "undo_claim":
        if (itemKey && item.key === itemKey) {
          item.tags = tags.filter(
            (t) =>
              t !== "auto_claimed" &&
              !t.startsWith("claimed_by:") &&
              !t.startsWith("claim_date:") &&
              !t.startsWith("claimant:"),
          );
          modified = true;
        }
        break;

      case "report":
        if (itemKey && item.key === itemKey) {
          if (!tags.includes("auto_reported")) tags.push("auto_reported");
          if (reporterName && !tags.some((t) => t.startsWith("reported_by:")))
            tags.push(`reported_by:${reporterName}`);
          if (reportDate && !tags.some((t) => t.startsWith("report_date:")))
            tags.push(`report_date:${reportDate}`);
          item.tags = tags;
          modified = true;
        }
        break;

      case "undo_report":
        if (itemKey && item.key === itemKey) {
          item.tags = tags.filter(
            (t) =>
              t !== "auto_reported" &&
              !t.startsWith("reported_by:") &&
              !t.startsWith("report_date:"),
          );
          modified = true;
        }
        break;

      case "undo_add":
        if (itemKey && item.key === itemKey) {
          items.splice(i, 1);
          modified = true;
          i--; // adjust index after removal
        }
        break;
    }
  }

  if (!modified) return;

  // Write updated literature_data back to Supabase
  const { error: updateError } = await supabase
    .from("shared_collections")
    .update({
      literature_data: items,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (updateError) {
    console.error("Failed to apply action to literature_data:", updateError.message);
  }
}