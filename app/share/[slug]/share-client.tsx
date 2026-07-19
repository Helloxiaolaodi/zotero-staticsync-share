"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  formatCreators,
  formatDisplayDate,
  formatPublicationTitle,
  makeDoiUrl,
  isValidDoi,
  parseDoiList,
  deriveLiteratureItem,
} from "@/lib/share-client";
import type {
  CollaborationActionType,
  DerivedLiteratureItem,
  PendingClientAction,
  SharedCollectionRecord,
  WorkflowBucket,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

const BUCKET_MAP: Record<WorkflowBucket, string> = {
  "to-read": "\u5F85\u9605\u8BFB",
  claimed: "\u5DF2\u8BA4\u9886",
  reported: "\u5DF2\u6C47\u62A5",
};

const BUCKET_ORDER: WorkflowBucket[] = ["to-read", "claimed", "reported"];

function bucketLabel(bucket: WorkflowBucket): string {
  return BUCKET_MAP[bucket] || bucket;
}

function clientId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  record: SharedCollectionRecord;
  items: DerivedLiteratureItem[];
  slug: string;
  initialAccess: boolean;
}

/* ------------------------------------------------------------------ */
/*  component                                                        */
/* ------------------------------------------------------------------ */

export default function ShareClient({ record, items, slug, initialAccess }: Props) {
  /* password gate --------------------------------------------------- */
  const [access, setAccess] = useState(initialAccess);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  /* literature state ------------------------------------------------ */
  const [derivedItems, setDerivedItems] = useState<DerivedLiteratureItem[]>(items);
  const [pendingActions, setPendingActions] = useState<PendingClientAction[]>([]);

  /* UI state -------------------------------------------------------- */
  const [activeBucket, setActiveBucket] = useState<WorkflowBucket | "all">("all");
  const [filterText, setFilterText] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  /* claim form state ------------------------------------------------ */
  const [claimTarget, setClaimTarget] = useState<DerivedLiteratureItem | null>(null);
  const [claimName, setClaimName] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [claimError, setClaimError] = useState("");

  /* report form state ----------------------------------------------- */
  const [reportTarget, setReportTarget] = useState<DerivedLiteratureItem | null>(null);
  const [reportName, setReportName] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportError, setReportError] = useState("");

  /* DOI add form state ---------------------------------------------- */
  const [addDoi, setAddDoi] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState("");
  const [claimedAddDoi, setClaimedAddDoi] = useState("");
  const [claimedAddName, setClaimedAddName] = useState("");
  const [claimedAddDate, setClaimedAddDate] = useState("");
  const [claimedAddError, setClaimedAddError] = useState("");
  const [claimedAddLoading, setClaimedAddLoading] = useState(false);
  const [claimedAddSuccess, setClaimedAddSuccess] = useState("");

  /* batch modal ----------------------------------------------------- */
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchError, setBatchError] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState("");

  /* guide panel ----------------------------------------------------- */
  const [guideOpen, setGuideOpen] = useState(false);

  const filterRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ */
  /*  derived lookups                                                   */
  /* ------------------------------------------------------------------ */

  const bucketCounts = useMemo(() => {
    const m: Record<WorkflowBucket, number> = { "to-read": 0, claimed: 0, reported: 0 };
    for (const item of derivedItems) m[item.bucket] = (m[item.bucket] || 0) + 1;
    return m;
  }, [derivedItems]);

  const filteredItems = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const source =
      activeBucket === "all"
        ? derivedItems
        : derivedItems.filter((item) => item.bucket === activeBucket);

    if (!query) return source;
    return source.filter((item) => item.matchedText.includes(query));
  }, [derivedItems, activeBucket, filterText]);

  /* ------------------------------------------------------------------ */
  /*  password gate                                                     */
  /* ------------------------------------------------------------------ */

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/share-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password: passwordValue }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPasswordError(data.error || "Incorrect password.");
      } else {
        setAccess(true);
      }
    } catch {
      setPasswordError("Network error. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  API helpers                                                       */
  /* ------------------------------------------------------------------ */

  async function postAction(actionType: CollaborationActionType, payload: Record<string, unknown>) {
    const res = await fetch("/api/share-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        action: {
          action_type: actionType,
          source_slug: slug,
          ...payload,
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Action failed.");
    return data.action;
  }

  async function cancelAction(actionId: number) {
    const res = await fetch("/api/share-actions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, actionId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Cancel failed.");
  }

  function addPending(act: PendingClientAction) {
    setPendingActions((prev) => [act, ...prev]);
  }

  function resolvePending(act: PendingClientAction, error?: string) {
    setPendingActions((prev) =>
      prev.map((p) =>
        p.clientId === act.clientId
          ? { ...p, status: error ? "failed" : "submitted", error: error || undefined }
          : p,
      ),
    );
  }

  function removePending(clientId: string) {
    setPendingActions((prev) => prev.filter((p) => p.clientId !== clientId));
  }

  /* ------------------------------------------------------------------ */
  /*  optimistic helpers                                                */
  /* ------------------------------------------------------------------ */

  const updateItemInList = useCallback(
    (key: string, updater: (item: DerivedLiteratureItem) => DerivedLiteratureItem) => {
      setDerivedItems((prev) =>
        prev.map((item) => (item.key === key ? updater(item) : item)),
      );
    },
    [],
  );

  function moveItemToBucket(key: string, toBucket: WorkflowBucket) {
    setDerivedItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, bucket: toBucket } : item)),
    );
  }

  /* ------------------------------------------------------------------ */
  /*  claim / undo / report / undo_add                                  */
  /* ------------------------------------------------------------------ */

  async function handleClaim(item: DerivedLiteratureItem) {
    setClaimTarget(item);
    setClaimName("");
    setClaimDate("");
    setClaimError("");
  }

  async function submitClaim() {
    if (!claimTarget) return;
    if (!claimName.trim()) { setClaimError("\u8BF7\u8F93\u5165\u6C47\u62A5\u4EBA\u59D3\u540D\u3002"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate.trim())) { setClaimError("\u8BF7\u8F93\u5165\u6709\u6548\u65E5\u671F\uFF08YYYY-MM-DD\uFF09\u3002"); return; }

    const key = claimTarget.key!;
    const item = claimTarget;
    setClaimTarget(null);
    moveItemToBucket(key, "claimed");

    try {
      await postAction("claim", {
        item_key: key,
        item_title: item.normalizedTitle,
        reporter_name: claimName.trim(),
        report_date: claimDate.trim(),
      });
    } catch {
      moveItemToBucket(key, item.bucket);
    }
  }

  async function handleUndoClaim(item: DerivedLiteratureItem) {
    const key = item.key!;
    moveItemToBucket(key, "to-read");
    try {
      await postAction("undo_claim", { item_key: key, item_title: item.normalizedTitle });
    } catch {
      moveItemToBucket(key, "claimed");
    }
  }

  async function handleReport(item: DerivedLiteratureItem) {
    setReportTarget(item);
    setReportName("");
    setReportDate("");
    setReportError("");
  }

  async function submitReport() {
    if (!reportTarget) return;
    if (!reportName.trim()) { setReportError("\u8BF7\u8F93\u5165\u6C47\u62A5\u4EBA\u59D3\u540D\u3002"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate.trim())) { setReportError("\u8BF7\u8F93\u5165\u6709\u6548\u65E5\u671F\uFF08YYYY-MM-DD\uFF09\u3002"); return; }

    const key = reportTarget.key!;
    const item = reportTarget;
    setReportTarget(null);
    moveItemToBucket(key, "reported");

    try {
      await postAction("report", {
        item_key: key,
        item_title: item.normalizedTitle,
        reporter_name: reportName.trim(),
        report_date: reportDate.trim(),
      });
    } catch {
      moveItemToBucket(key, item.bucket);
    }
  }

  async function handleUndoAdd(item: DerivedLiteratureItem) {
    const key = item.key;
    if (!key) return;
    setDerivedItems((prev) => prev.filter((it) => it.key !== key));
    try {
      await postAction("undo_add", { item_key: key, item_title: item.normalizedTitle });
    } catch {
      setDerivedItems((prev) => [...prev, item]);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  DOI add (to-read)                                                  */
  /* ------------------------------------------------------------------ */

  async function handleAddToDoiSubmit() {
    const doi = addDoi.trim();
    if (!isValidDoi(doi)) {
      setAddError("\u8BF7\u8F93\u5165 DOI\uFF0C\u4E14\u5FC5\u987B\u4EE5 10. \u5F00\u5934\u3002");
      return;
    }
    setAddError("");
    setAddLoading(true);
    setAddSuccess("");

    const cid = clientId();
    const pendingItem: DerivedLiteratureItem = {
      key: cid,
      title: doi,
      normalizedTitle: doi,
      normalizedCreators: [],
      normalizedDoi: doi,
      normalizedDate: "",
      normalizedPublicationTitle: "",
      bucket: "to-read",
      isUserAdded: true,
      matchedText: doi.toLowerCase(),
    };

    setDerivedItems((prev) => [pendingItem, ...prev]);
    addPending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: new Date().toISOString(), status: "pending" });

    try {
      const action = await postAction("add_by_doi", { doi });
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" });
      // update local item with action id for cancel support
      updateLocalItemTempKey(cid, { actionId: action.id });
      setAddDoi("");
      setAddSuccess("\u63D0\u4EA4\u6210\u529F\uFF0C\u6587\u732E\u5DF2\u52A0\u5165 Zotero \u7FA4\u7EC4\u3002");
      setTimeout(() => setAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setAddError("\u63D0\u4EA4\u5931\u8D25\uFF1A" + msg);
      setDerivedItems((prev) => prev.filter((it) => it.key !== cid));
    } finally {
      setAddLoading(false);
    }
  }

  function updateLocalItemTempKey(clientKey: string, patch: Partial<DerivedLiteratureItem>) {
    setDerivedItems((prev) =>
      prev.map((it) => (it.key === clientKey ? { ...it, ...patch } : it)),
    );
  }

  /* DOI add (claimed) ----------------------------------------------- */

  async function handleClaimedAddSubmit() {
    const doi = claimedAddDoi.trim();
    if (!isValidDoi(doi)) {
      setClaimedAddError("\u8BF7\u8F93\u5165 DOI\uFF0C\u4E14\u5FC5\u987B\u4EE5 10. \u5F00\u5934\u3002");
      return;
    }
    if (!claimedAddName.trim()) { setClaimedAddError("\u8BF7\u8F93\u5165\u6C47\u62A5\u4EBA\u59D3\u540D\u3002"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimedAddDate.trim())) { setClaimedAddError("\u8BF7\u8F93\u5165\u6709\u6548\u65E5\u671F\uFF08YYYY-MM-DD\uFF09\u3002"); return; }

    setClaimedAddError("");
    setClaimedAddLoading(true);
    setClaimedAddSuccess("");

    const cid = clientId();
    const pendingItem: DerivedLiteratureItem = {
      key: cid,
      title: doi,
      normalizedTitle: doi,
      normalizedCreators: [],
      normalizedDoi: doi,
      normalizedDate: "",
      normalizedPublicationTitle: "",
      bucket: "claimed",
      isUserAdded: true,
      matchedText: doi.toLowerCase(),
      claimantName: claimedAddName.trim(),
      claimDate: claimedAddDate.trim(),
    };

    setDerivedItems((prev) => [pendingItem, ...prev]);
    addPending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: new Date().toISOString(), status: "pending" });

    try {
      const action = await postAction("add_by_doi", {
        doi,
        reporter_name: claimedAddName.trim(),
        report_date: claimedAddDate.trim(),
      });
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" });
      updateLocalItemTempKey(cid, { actionId: action.id });
      setClaimedAddDoi("");
      setClaimedAddName("");
      setClaimedAddDate("");
      setClaimedAddSuccess("\u63D0\u4EA4\u6210\u529F\uFF0C\u6587\u732E\u5DF2\u52A0\u5165 Zotero \u7FA4\u7EC4\u3002");
      setTimeout(() => setClaimedAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setClaimedAddError("\u63D0\u4EA4\u5931\u8D25\uFF1A" + msg);
      setDerivedItems((prev) => prev.filter((it) => it.key !== cid));
    } finally {
      setClaimedAddLoading(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  batch import                                                      */
  /* ------------------------------------------------------------------ */

  async function handleBatchSubmit() {
    const dois = parseDoiList(batchText);
    if (!dois.length) {
      setBatchError("\u8BF7\u8F93\u5165\u81F3\u5C11\u4E00\u4E2A\u6709\u6548 DOI\uFF08\u4EE5 10. \u5F00\u5934\uFF09\u3002");
      return;
    }
    setBatchError("");
    setBatchLoading(true);
    setBatchSuccess("");

    const cids: string[] = [];
    for (const doi of dois) {
      const cid = clientId();
      cids.push(cid);
      const pendingItem: DerivedLiteratureItem = {
        key: cid,
        title: doi,
        normalizedTitle: doi,
        normalizedCreators: [],
        normalizedDoi: doi,
        normalizedDate: "",
        normalizedPublicationTitle: "",
        bucket: "to-read",
        isUserAdded: true,
        matchedText: doi.toLowerCase(),
      };
      setDerivedItems((prev) => [pendingItem, ...prev]);
    }

    let failed = 0;
    for (const doi of dois) {
      try {
        await postAction("add_by_doi", { doi });
      } catch {
        failed++;
      }
    }

    setBatchLoading(false);
    if (failed) {
      setBatchError(`${failed} \u4E2A DOI \u63D0\u4EA4\u5931\u8D25\u3002`);
    } else {
      setBatchSuccess("\u6279\u91CF\u63D0\u4EA4\u6210\u529F\uFF01");
      setBatchOpen(false);
      setBatchText("");
      setTimeout(() => setBatchSuccess(""), 3000);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  cancel pending add                                                */
  /* ------------------------------------------------------------------ */

  async function handleCancelPendingAdd(item: DerivedLiteratureItem) {
    const clientKey = item.key!;
    const pending = pendingActions.find(
      (p) => p.clientId === clientKey && p.actionType === "add_by_doi",
    );
    setDerivedItems((prev) => prev.filter((it) => it.key !== clientKey));
    removePending(clientKey);

    if (pending?.actionId) {
      try { await cancelAction(pending.actionId); } catch { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  expand toggle                                                     */
  /* ------------------------------------------------------------------ */

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  render helpers                                                    */
  /* ------------------------------------------------------------------ */

  function renderBadge(bucket: WorkflowBucket) {
    const colors: Record<WorkflowBucket, string> = {
      "to-read": "ss-badge-gray",
      claimed: "ss-badge-blue",
      reported: "ss-badge-green",
    };
    return <span className={`ss-badge ${colors[bucket]}`}>{bucketLabel(bucket)}</span>;
  }

  function renderCard(item: DerivedLiteratureItem, index: number) {
    const isHighlighted = !!filterText.trim().toLowerCase();
    const abstractNote =
      item.summary || item.description || item.abstractNote || "";
    const hasAbstract = abstractNote.length > 0;
    const isExpanded = expandedKeys.has(item.key || `idx_${index}`);
    const doiLink = makeDoiUrl(item.doi);
    const isPending = pendingActions.some(
      (p) =>
        p.clientId === item.key &&
        p.actionType === "add_by_doi" &&
        (p.status === "pending" || p.status === "submitted"),
    );
    const isToRead = activeBucket === "to-read" || (activeBucket === "all" && item.bucket === "to-read");
    const isClaimed = activeBucket === "claimed" || (activeBucket === "all" && item.bucket === "claimed");
    const isReported = item.bucket === "reported";

    return (
      <article
        key={item.key || `idx_${index}`}
        className={`ss-card${isHighlighted ? " ss-card-hl" : ""}${isPending ? " ss-card-pending" : ""}`}
      >
        <div className="ss-card-title-row">
          {/* only show toggle placeholder if not expandable */}
          <span className={`ss-toggle${hasAbstract ? "" : " ss-toggle-hidden"}`}>
            {hasAbstract ? (isExpanded ? "\u25be" : "\u25b8") : ""}
          </span>
          {isPending && <span className="ss-pending-dot" title="Pending sync" />}
          <span className="ss-card-title" onClick={hasAbstract ? () => toggleExpand(item.key || `idx_${index}`) : undefined}>
            {item.url && !isPending ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title || item.normalizedTitle}
              </a>
            ) : (
              item.title || item.normalizedTitle
            )}
          </span>
        </div>

        {/* badges */}
        <div className="ss-badges">
          {renderBadge(item.bucket)}
          {item.isUserAdded && <span className="ss-badge ss-badge-amber">\u5DF2\u6DFB\u52A0</span>}
          {isReported && item.reportDate && isDatePassed(item.reportDate) && (
            <span className="ss-badge ss-badge-red">\u5DF2\u8FC7\u671F</span>
          )}
        </div>

        {/* authors */}
        {item.normalizedCreators.length > 0 && (
          <div className="ss-authors">
            {formatCreators(item.normalizedCreators)}
          </div>
        )}

        {/* metadata row */}
        <div className="ss-meta">
          {item.normalizedPublicationTitle && (
            <span className="ss-meta-journal">{item.normalizedPublicationTitle}</span>
          )}
          {item.normalizedDate && <span>{item.normalizedDate}</span>}
          {doiLink && (
            <a href={doiLink} target="_blank" rel="noreferrer" className="ss-doi-link">
              DOI
            </a>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="ss-doi-link">
              \u67E5\u770B\u539F\u6587
            </a>
          )}
        </div>

        {/* reporter row */}
        {(item.reporterName || item.reportDate || item.claimantName || item.claimDate) && (
          <div className="ss-reporter-row">
            {item.reporterName && (
              <span className="ss-chip">\u6C47\u62A5\u4EBA: {item.reporterName}</span>
            )}
            {item.reportDate && (
              <span className="ss-chip">\u65E5\u671F: {item.reportDate}</span>
            )}
            {item.claimantName && (
              <span className="ss-chip">\u8BA4\u9886\u4EBA: {item.claimantName}</span>
            )}
            {item.claimDate && (
              <span className="ss-chip">\u8BA4\u9886\u65E5\u671F: {item.claimDate}</span>
            )}
          </div>
        )}

        {/* abstract */}
        {hasAbstract && (
          <div className={`ss-abstract${isExpanded ? " ss-abstract-open" : ""}`}>
            {abstractNote}
          </div>
        )}

        {/* tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="ss-tags">
            {item.tags.map((tag) => (
              <span className="ss-tag" key={tag}>#{tag}</span>
            ))}
          </div>
        )}

        {/* actions */}
        <div className="ss-actions">
          {isPending && (
            <span className="ss-action-info">\u540C\u6B65\u4E2D...</span>
          )}
          {isToRead && !item.isUserAdded && !isPending && (
            <button className="ss-btn-primary" onClick={() => handleClaim(item)}>
              \u8BA4\u9886
            </button>
          )}
          {isClaimed && !isReported && !isPending && (
            <>
              <button className="ss-btn-primary" onClick={() => handleReport(item)}>
                \u6C47\u62A5
              </button>
              <button className="ss-btn-danger-outline" onClick={() => handleUndoClaim(item)}>
                \u64A4\u9500\u8BA4\u9886
              </button>
            </>
          )}
          {item.isUserAdded && !isPending && (
            <button
              className="ss-btn-danger-outline"
              onClick={() => {
                if (item.key && !pendingActions.find((p) => p.clientId === item.key)) {
                  handleUndoAdd(item);
                } else {
                  handleCancelPendingAdd(item);
                }
              }}
            >
              \u64A4\u9500
            </button>
          )}
        </div>
      </article>
    );
  }

  function isDatePassed(dateStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < new Date();
  }

  /* ------------------------------------------------------------------ */
  /*  main render                                                       */
  /* ------------------------------------------------------------------ */

  if (!access) {
    return (
      <main className="ss-pw-page">
        <div className="ss-pw-card">
          <h1 className="ss-pw-title">{record.collection_name || record.title || "Protected Collection"}</h1>
          <p className="ss-pw-desc">\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801\u4EE5\u67E5\u770B\u6587\u732E\u3002</p>
          <form onSubmit={handlePasswordSubmit} className="ss-pw-form">
            <input
              type="password"
              className="ss-pw-input"
              placeholder="\u8BBF\u95EE\u5BC6\u7801"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className="ss-btn-primary" disabled={passwordLoading}>
              {passwordLoading ? "\u9A8C\u8BC1\u4E2D..." : "\u8FDB\u5165"}
            </button>
          </form>
          {passwordError && <p className="ss-error-text">{passwordError}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="ss-page">
      <div className="ss-shell">
        {/* header */}
        <header className="ss-header">
          <h1 className="ss-title">
            {record.collection_name || record.title || "Untitled Collection"}
          </h1>
          <div className="ss-meta-row">
            {record.collection_path_text && <span>{record.collection_path_text}</span>}
            <span>{derivedItems.length} items</span>
            {record.library_name && <span>{record.library_name}</span>}
            {record.updated_at && (
              <span>Updated {new Date(record.updated_at).toLocaleString()}</span>
            )}
          </div>
        </header>

        {/* toolbar */}
        <div className="ss-toolbar">
          <input
            ref={filterRef}
            type="text"
            className="ss-filter-input"
            placeholder="\u7B5B\u9009\uFF08\u6807\u9898\u3001\u4F5C\u8005\u3001DOI\uFF09"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              className="ss-filter-clear"
              onClick={() => { setFilterText(""); filterRef.current?.focus(); }}
            >
              \u6E05\u9664
            </button>
          )}
          <button className="ss-guide-btn" onClick={() => setGuideOpen(true)}>
            \u4F7F\u7528\u6307\u5357
          </button>
        </div>

        {/* tabs */}
        <div className="ss-tabs" role="tablist">
          {BUCKET_ORDER.map((bucket) => {
            const count = bucketCounts[bucket];
            return (
              <button
                key={bucket}
                role="tab"
                className={`ss-tab${activeBucket === bucket ? " ss-tab-active" : ""}`}
                onClick={() => setActiveBucket(bucket)}
              >
                {bucketLabel(bucket)} ({count})
              </button>
            );
          })}
          <button
            role="tab"
            className={`ss-tab${activeBucket === "all" ? " ss-tab-active" : ""}`}
            onClick={() => setActiveBucket("all")}
          >
            \u5168\u90E8 ({derivedItems.length})
          </button>
        </div>

        {/* add DOI form: to-read */}
        {(activeBucket === "to-read" || activeBucket === "all") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">\u6DFB\u52A0\u65B0\u6587\u732E\u5230 Zotero \u6587\u732E\u5E93</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="DOI\uFF08\u5FC5\u586B\uFF0C\u4F8B\u5982 10.1016/...\uFF09"
                value={addDoi}
                onChange={(e) => setAddDoi(e.target.value)}
              />
              <button className="ss-btn-primary" onClick={handleAddToDoiSubmit} disabled={addLoading}>
                {addLoading ? "\u63D0\u4EA4\u4E2D..." : "\u63D0\u4EA4"}
              </button>
              <button className="ss-btn-secondary" onClick={() => { setBatchOpen(true); }}>
                \u6279\u91CF\u5BFC\u5165
              </button>
            </div>
            {addError && <p className="ss-error-text">{addError}</p>}
            {addSuccess && <p className="ss-success-text">{addSuccess}</p>}
          </div>
        )}

        {/* add DOI form: claimed */}
        {(activeBucket === "claimed" || activeBucket === "all") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">\u6DFB\u52A0\u65B0\u6587\u732E\u5230 Zotero \u6587\u732E\u5E93</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="DOI\uFF08\u5FC5\u586B\uFF0C\u4F8B\u5982 10.1016/...\uFF09"
                value={claimedAddDoi}
                onChange={(e) => setClaimedAddDoi(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="\u6C47\u62A5\u4EBA\u59D3\u540D\uFF08\u683C\u5F0F\uFF1ASan Zhang\uFF09"
                value={claimedAddName}
                onChange={(e) => setClaimedAddName(e.target.value)}
              />
              <span className="ss-upload-label">\u6C47\u62A5\u65E5\u671F</span>
              <input
                type="date"
                className="ss-upload-date"
                value={claimedAddDate}
                onChange={(e) => setClaimedAddDate(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <button className="ss-btn-primary" onClick={handleClaimedAddSubmit} disabled={claimedAddLoading}>
                {claimedAddLoading ? "\u63D0\u4EA4\u4E2D..." : "\u63D0\u4EA4"}
              </button>
            </div>
            {claimedAddError && <p className="ss-error-text">{claimedAddError}</p>}
            {claimedAddSuccess && <p className="ss-success-text">{claimedAddSuccess}</p>}
          </div>
        )}

        {/* literature cards */}
        <div className="ss-card-list">
          {filteredItems.length ? (
            filteredItems.map((item, index) => renderCard(item, index))
          ) : (
            <div className="ss-empty">\u8BE5\u5206\u7C7B\u4E0B\u6682\u65E0\u6587\u732E\u3002</div>
          )}
        </div>
      </div>

      {/* claim modal */}
      {claimTarget && (
        <div className="ss-overlay" onClick={() => setClaimTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">\u6587\u732E\u8BA4\u9886</h4>
            <p className="ss-dialog-paper">{claimTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder="\u6C47\u62A5\u4EBA\u59D3\u540D\uFF08\u683C\u5F0F\uFF1ASan Zhang\uFF09"
              value={claimName}
              onChange={(e) => setClaimName(e.target.value)}
              autoFocus
            />
            <input
              type="date"
              className="ss-dialog-input"
              value={claimDate}
              onChange={(e) => setClaimDate(e.target.value)}
            />
            {claimError && <p className="ss-error-text">{claimError}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setClaimTarget(null)}>\u53D6\u6D88</button>
              <button className="ss-btn-primary" onClick={submitClaim}>\u786E\u8BA4\u65E0\u8BEF</button>
            </div>
          </div>
        </div>
      )}

      {/* report modal */}
      {reportTarget && (
        <div className="ss-overlay" onClick={() => setReportTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">\u6587\u732E\u6C47\u62A5</h4>
            <p className="ss-dialog-paper">{reportTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder="\u6C47\u62A5\u4EBA\u59D3\u540D\uFF08\u683C\u5F0F\uFF1ASan Zhang\uFF09"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              autoFocus
            />
            <input
              type="date"
              className="ss-dialog-input"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            {reportError && <p className="ss-error-text">{reportError}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setReportTarget(null)}>\u53D6\u6D88</button>
              <button className="ss-btn-primary" onClick={submitReport}>\u786E\u8BA4\u65E0\u8BEF</button>
            </div>
          </div>
        </div>
      )}

      {/* batch modal */}
      {batchOpen && (
        <div className="ss-overlay" onClick={() => setBatchOpen(false)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">\u6279\u91CF\u5BFC\u5165 DOI</h4>
            <textarea
              className="ss-batch-textarea"
              rows={8}
              placeholder="\u6BCF\u884C\u4E00\u4E2A DOI\uFF0C\u6216\u7528\u5206\u53F7\u3001\u7A7A\u683C\u7B49\u5206\u9694\uFF0C\u4F8B\u5982\uFF1A10.1234/abc ; 10.5678/def"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            {batchError && <p className="ss-error-text">{batchError}</p>}
            {batchSuccess && <p className="ss-success-text">{batchSuccess}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setBatchOpen(false)}>\u53D6\u6D88</button>
              <button className="ss-btn-primary" onClick={handleBatchSubmit} disabled={batchLoading}>
                {batchLoading ? "\u63D0\u4EA4\u4E2D..." : "\u63D0\u4EA4"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* guide panel */}
      {guideOpen && (
        <div className="ss-overlay" onClick={() => setGuideOpen(false)}>
          <div className="ss-guide-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ss-guide-header">
              <h3 className="ss-guide-title">\u4F7F\u7528\u6307\u5357</h3>
              <button className="ss-guide-close" onClick={() => setGuideOpen(false)}>&#215;</button>
            </div>
            <div className="ss-guide-body">
              <h5>\u4E00\u3001\u8BA4\u9886\u6587\u732E</h5>
              <p>\u5728\u2308\u5F85\u9605\u8BFB\u230B \u533A\u70B9\u51FB\u201C\u8BA4\u9886\u201D\uFF0C\u8F93\u5165\u6C47\u62A5\u4EBA\u59D3\u540D\u548C\u6C47\u62A5\u65E5\u671F\u6765\u8BA4\u9886\u6587\u732E\uFF0C\u6587\u732E\u4F1A\u81EA\u52A8\u79FB\u81F3 \u2308\u5DF2\u8BA4\u9886\u230B \u533A\u3002</p>
              <h5>\u4E8C\u3001\u6DFB\u52A0\u6587\u732E</h5>
              <p>\uFF081\uFF09\u5728\u2308\u5F85\u9605\u8BFB\u230B\u533A\u8F93\u5165\u5355\u4E2A\u6587\u732E\u7684DOI\u5E76\u70B9\u51FB\u201C\u63D0\u4EA4\u201D\uFF0C\u5B8C\u6210\u6DFB\u52A0\u65B0\u6587\u732E\uFF1B\u4E5F\u53EF\u4F7F\u7528\u6279\u91CF\u5BFC\u5165 DOI \u529F\u80FD\uFF0C\u5373\u4E00\u6B21\u6027\u6DFB\u52A0\u591A\u7BC7\u6587\u732E\u3002</p>
              <p>\uFF082\uFF09\u5C1A\u672A\u7EB3\u5165 Zotero \u6587\u732E\u5E93\u7684\u6587\u732E\uFF0C\u6C47\u62A5\u4EBA\u9700\u5728\u2308\u5DF2\u8BA4\u9886\u230B \u533A\u8F93\u5165\u5355\u7BC7\u6587\u732E\u7684DOI\u3001\u6C47\u62A5\u4EBA\u59D3\u540D\u548C\u6C47\u62A5\u65E5\u671F\uFF0C\u6587\u732E\u4F1A\u81EA\u52A8\u79FB\u81F3 \u2308\u5DF2\u8BA4\u9886\u230B \u533A\u3002</p>
              <h5>\u4E09\u3001\u64A4\u9500\u6587\u732E</h5>
              <p>\u5DF2\u8BA4\u9886\u7684\u6587\u732E\u53EF\u70B9\u51FB\u201C\u64A4\u9500\u8BA4\u9886\u201D\uFF0C\u9000\u56DE\u2308\u5F85\u9605\u8BFB\u230B \u533A\uFF1B\u65B0\u6DFB\u52A0\u7684\u6587\u732E\u53EF\u70B9\u51FB\u201C\u64A4\u9500\u201D\uFF0C\u4ECEZotero\u6587\u732E\u5E93\u4E2D\u5220\u9664\u3002</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
