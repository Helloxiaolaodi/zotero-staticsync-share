import { cookies } from "next/headers";
import { cache } from "react";
import { createHash } from "crypto";
import { getSupabaseClient } from "@/lib/supabase";
import { getCookieName } from "@/lib/share-client";
import type {
  SharedCollectionActionInsert,
  SharedCollectionActionRecord,
  SharedCollectionRecord,
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