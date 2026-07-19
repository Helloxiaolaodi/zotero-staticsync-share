export type WorkflowBucket = "to-read" | "claimed" | "reported";

export type CollaborationActionType =
  | "claim"
  | "undo_claim"
  | "report"
  | "add_by_doi"
  | "undo_add";

export interface SharedLiteratureItem {
  key?: string;
  slug?: string;
  title?: string;
  creators?: string[];
  abstractNote?: string;
  summary?: string;
  description?: string;
  date?: string;
  year?: string;
  url?: string;
  doi?: string;
  itemType?: string;
  publicationTitle?: string;
  status?: string;
  readingStatus?: string;
  libraryName?: string;
  collectionName?: string;
  collectionPath?: string[];
  collectionPathText?: string;
  tags?: string[];
  note?: string;
}

export interface SharedCollectionRecord {
  id?: string;
  slug?: string;
  title?: string;
  collection_name?: string;
  collection_path?: string[];
  collection_path_text?: string;
  library_name?: string;
  library_id?: number;
  password?: string | null;
  item_count?: number;
  literature_data?: SharedLiteratureItem[];
  status_source?: string;
  source?: string;
  schema_version?: number;
  is_collaborative?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SharedCollectionActionInsert {
  action_type: CollaborationActionType;
  source_slug: string;
  item_key?: string | null;
  item_title?: string | null;
  doi?: string | null;
  reporter_name?: string | null;
  report_date?: string | null;
  processed?: boolean;
}

export interface SharedCollectionActionRecord extends SharedCollectionActionInsert {
  id: number;
  created_at: string;
}

export interface DerivedLiteratureItem extends SharedLiteratureItem {
  normalizedTitle: string;
  normalizedCreators: string[];
  normalizedDoi: string;
  normalizedDate: string;
  normalizedPublicationTitle: string;
  bucket: WorkflowBucket;
  reporterName?: string;
  reportDate?: string;
  claimantName?: string;
  claimDate?: string;
  addedBy?: string;
  addedDate?: string;
  isUserAdded: boolean;
  matchedText: string;
}

export interface PendingClientAction {
  clientId: string;
  actionId?: number;
  actionType: CollaborationActionType;
  itemKey?: string;
  doi?: string;
  createdAt: string;
  status: "pending" | "submitted" | "failed" | "cancelled";
  error?: string;
}

export interface ShareAccessPayload {
  slug: string;
  password: string;
}

export interface ShareActionRequest {
  slug: string;
  action: SharedCollectionActionInsert;
}

export interface ShareActionResponse {
  ok: boolean;
  action?: SharedCollectionActionRecord;
  error?: string;
}

export interface ShareActionCancelRequest {
  slug: string;
  actionId: number;
}

export interface ShareActionCancelResponse {
  ok: boolean;
  error?: string;
}
