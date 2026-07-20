import type {
  CollaborationActionType,
  DerivedLiteratureItem,
  SharedLiteratureItem,
  WorkflowBucket,
} from "@/lib/types";

const SHARE_COOKIE_PREFIX = "staticsync-share-";

function normalizeWhitespace(value: string | undefined | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string | undefined | null): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeDoi(value: string | undefined | null): string {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  return text
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function extractTagValue(tags: string[] | undefined, prefix: string): string | undefined {
  if (!tags?.length) return undefined;
  const found = tags.find((tag) => tag.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!found) return undefined;
  return found.slice(prefix.length).trim() || undefined;
}

function hasTag(tags: string[] | undefined, target: string): boolean {
  if (!tags?.length) return false;
  const needle = target.toLowerCase();
  return tags.some((tag) => normalizeLower(tag) === needle);
}

function isDatePassed(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d <= today;
}

export function formatDisplayDate(input?: string): string {
  const text = normalizeWhitespace(input);
  if (!text) return "";
  const fullDate = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (fullDate) {
    return fullDate[3] ? `${fullDate[1]}-${fullDate[2]}-${fullDate[3]}` : `${fullDate[1]}-${fullDate[2]}`;
  }
  const yearMonth = text.match(/^(\d{4})[\/.](\d{1,2})$/);
  if (yearMonth) {
    return `${yearMonth[1]}-${yearMonth[2].padStart(2, "0")}`;
  }
  const year = text.match(/\b(19|20)\d{2}\b/);
  return year ? year[0] : text;
}

export function formatCreators(creators: string[] | undefined): string {
  if (!creators?.length) return "";
  if (creators.length <= 3) {
    return creators.join(", ");
  }
  return `${creators.slice(0, 3).join(", ")}, et al.`;
}

export function formatPublicationTitle(title?: string): string {
  const text = normalizeWhitespace(title);
  if (!text) return "";
  return text.length > 30 ? `${text.slice(0, 30).trimEnd()}...` : text;
}

export function makeDoiUrl(doi?: string): string | undefined {
  const normalized = normalizeDoi(doi);
  return normalized ? `https://doi.org/${normalized}` : undefined;
}

export function getCookieName(slug: string): string {
  return `${SHARE_COOKIE_PREFIX}${slug}`;
}

function resolveBucket(item: SharedLiteratureItem): WorkflowBucket {
  const tags = item.tags || [];
  const collectionPath = item.collectionPath || [];
  const collectionName = normalizeLower(item.collectionName);
  const leafCollection = normalizeLower(collectionPath[collectionPath.length - 1] || "");
  const readingStatus = normalizeLower(item.readingStatus || item.status);

  // Priority 1: readingStatus (explicitly set by plugin to leaf collection name)
  if (readingStatus.includes("已汇报") || readingStatus.includes("reported")) {
    return "reported";
  }
  if (readingStatus.includes("已认领") || readingStatus.includes("claimed") || readingStatus.includes("assigned")) {
    return "claimed";
  }
  if (readingStatus.includes("待阅读") || readingStatus.includes("to-read") || readingStatus.includes("unread") || readingStatus.includes("pending")) {
    return "to-read";
  }

  // Priority 2: leaf collection name from collectionPath
  if (leafCollection.includes("已汇报") || leafCollection.includes("reported")) {
    return "reported";
  }
  if (leafCollection.includes("已认领") || leafCollection.includes("claimed") || leafCollection.includes("assigned")) {
    return "claimed";
  }
  if (leafCollection.includes("待阅读") || leafCollection.includes("to-read") || leafCollection.includes("unread") || leafCollection.includes("pending")) {
    return "to-read";
  }

  // Priority 3: collectionName
  if (collectionName.includes("已汇报") || collectionName.includes("reported")) {
    return "reported";
  }
  if (collectionName.includes("已认领") || collectionName.includes("claimed") || collectionName.includes("assigned")) {
    return "claimed";
  }
  if (collectionName.includes("待阅读") || collectionName.includes("to-read") || collectionName.includes("unread") || collectionName.includes("pending")) {
    return "to-read";
  }

  // Priority 4: tags
  if (
    hasTag(tags, "auto_reported") ||
    extractTagValue(tags, "reported_by:") ||
    extractTagValue(tags, "report_date:") ||
    extractTagValue(tags, "report-date:") ||
    readingStatus.includes("reported") ||
    collectionName.includes("reported") ||
    collectionName.includes("已汇报")
  ) {
    return "reported";
  }

  if (
    hasTag(tags, "auto_claimed") ||
    hasTag(tags, "external-claim") ||
    extractTagValue(tags, "claimed_by:") ||
    extractTagValue(tags, "claimant:") ||
    extractTagValue(tags, "claim_date:") ||
    extractTagValue(tags, "added_by:") ||
    extractTagValue(tags, "added_date:") ||
    readingStatus.includes("claim") ||
    collectionName.includes("claimed") ||
    collectionName.includes("已认领")
  ) {
    // Auto-transition: if the claim/presentation date has passed, promote to reported
    const dateStr = extractTagValue(tags, "claim_date:")
      || extractTagValue(tags, "report-date:")
      || extractTagValue(tags, "report_date:");
    if (dateStr && isDatePassed(dateStr)) {
      return "reported";
    }
    return "claimed";
  }

  return "to-read";
}

export function deriveLiteratureItem(item: SharedLiteratureItem): DerivedLiteratureItem {
  const tags = item.tags || [];
  const normalizedCreators = (item.creators || []).map((creator) => normalizeWhitespace(creator)).filter(Boolean);
  const normalizedTitle = normalizeWhitespace(item.title) || "Untitled Item";
  const normalizedDoi = normalizeDoi(item.doi);
  const normalizedDate = formatDisplayDate(item.date || item.year);
  const normalizedPublicationTitle = formatPublicationTitle(item.publicationTitle);
  const bucket = resolveBucket(item);
 const reporterName = extractTagValue(tags, "reported_by:");
 const reportDate = extractTagValue(tags, "report_date:") || extractTagValue(tags, "report-date:");
  const claimantName = extractTagValue(tags, "claimed_by:") || extractTagValue(tags, "claimant:");
  const claimDate = extractTagValue(tags, "claim_date:") || extractTagValue(tags, "report-date:");
  const addedBy = extractTagValue(tags, "added_by:");
  const addedDate = extractTagValue(tags, "added_date:");
  const matchedText = [
    normalizedTitle,
    normalizedCreators.join(" "),
    normalizedDoi,
    normalizeWhitespace(item.publicationTitle),
    normalizeWhitespace(item.summary || item.description || item.abstractNote),
    normalizeWhitespace(item.note),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...item,
    normalizedTitle,
    normalizedCreators,
    normalizedDoi,
    normalizedDate,
    normalizedPublicationTitle,
    bucket,
    reporterName,
    reportDate,
    claimantName,
    claimDate,
    addedBy,
    addedDate,
    isUserAdded: Boolean(addedBy || addedDate || hasTag(tags, "external-claim")),
    matchedText,
  };
}

export function deriveLiteratureItems(items: SharedLiteratureItem[] | undefined): DerivedLiteratureItem[] {
  return (items || []).map((item) => deriveLiteratureItem(item));
}

export function validateActionType(value: string): value is CollaborationActionType {
  return ["claim", "undo_claim", "report", "undo_report", "add_by_doi", "undo_add"].includes(value);
}

export function parseDoiList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s;,\n\r\t]+/)
        .map((part) => normalizeDoi(part))
        .filter(Boolean),
    ),
  );
}

export function isValidDoi(input: string): boolean {
  return /^10\.[^\s/]+\/.+/i.test(normalizeDoi(input));
}
