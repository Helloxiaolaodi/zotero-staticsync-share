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
  created_at?: string;
  updated_at?: string;
}
