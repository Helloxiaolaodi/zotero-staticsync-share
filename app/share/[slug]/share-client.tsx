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

function isDisplayTag(tag: string): boolean {
  const v = (tag || "").toLowerCase().trim();
  if (v.startsWith("claimant:") || v.startsWith("claimant：")) return false;
  if (v.startsWith("report-date:") || v.startsWith("report-date：")) return false;
  if (v.startsWith("reported_by:") || v.startsWith("reported_date:")) return false;
  if (v.startsWith("claimed_by:") || v.startsWith("claimed_date:")) return false;
  if (v.startsWith("added_by:") || v.startsWith("added_by：")) return false;
  if (v.startsWith("added_date:") || v.startsWith("added_date：")) return false;
  if (v === "auto_reported" || v === "auto_claimed") return false;
  return true;
}

const BUCKET_MAP: Record<WorkflowBucket, string> = {
  "to-read": "待阅读",
  claimed: "已认领",
  reported: "已汇报",
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
    if (!claimName.trim()) { setClaimError("请输入汇报人姓名。"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate.trim())) { setClaimError("请输入有效日期（YYYY-MM-DD）。"); return; }

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
    if (!reportName.trim()) { setReportError("请输入汇报人姓名。"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate.trim())) { setReportError("请输入有效日期（YYYY-MM-DD）。"); return; }

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
      setAddError("请输入 DOI，且必须以 10. 开头。");
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
      setAddSuccess("提交成功，文献已加入 Zotero 群组。");
      setTimeout(() => setAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setAddError("提交失败：" + msg);
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
      setClaimedAddError("请输入 DOI，且必须以 10. 开头。");
      return;
    }
    if (!claimedAddName.trim()) { setClaimedAddError("请输入汇报人姓名。"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimedAddDate.trim())) { setClaimedAddError("请输入有效日期（YYYY-MM-DD）。"); return; }

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
      setClaimedAddSuccess("提交成功，文献已加入 Zotero 群组。");
      setTimeout(() => setClaimedAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setClaimedAddError("提交失败：" + msg);
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
      setBatchError("请输入至少一个有效 DOI（以 10. 开头）。");
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
      setBatchError(`${failed} 个 DOI 提交失败。`);
    } else {
      setBatchSuccess("批量提交成功！");
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
            {hasAbstract ? (isExpanded ? "▾" : "▸") : ""}
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
          {item.isUserAdded && <span className="ss-badge ss-badge-amber">已添加</span>}
          {isReported && item.reportDate && isDatePassed(item.reportDate) && (
            <span className="ss-badge ss-badge-red">已过期</span>
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
          {item.normalizedDate && <span>{item.normalizedDate}</span>}
          {item.normalizedDate && item.normalizedPublicationTitle && <span className="ss-meta-sep">|</span>}
          {item.normalizedPublicationTitle && (
            <span className="ss-meta-journal">{item.normalizedPublicationTitle}</span>
          )}
          {((item.normalizedDate || item.normalizedPublicationTitle) && item.normalizedDoi) && <span className="ss-meta-sep">|</span>}
          {item.normalizedDoi && (
            <a href={`https://doi.org/${item.normalizedDoi}`} target="_blank" rel="noreferrer" className="ss-doi-link">
              DOI: {item.normalizedDoi}
            </a>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="ss-doi-link">
              查看原文
            </a>
          )}
        </div>

        {/* reporter row */}
        {(item.reporterName || item.reportDate || item.claimantName || item.claimDate) && (
          <div className="ss-reporter-row">
            {item.reporterName && (
              <span className="ss-chip">汇报人: {item.reporterName}</span>
            )}
            {item.reportDate && (
              <span className="ss-chip">汇报日期: {item.reportDate}</span>
            )}
            {item.claimantName && (
              <span className="ss-chip">汇报人: {item.claimantName}</span>
            )}
            {item.claimDate && (
              <span className="ss-chip">汇报日期: {item.claimDate}</span>
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
            {item.tags
              .filter(isDisplayTag)
              .map((tag) => (
                <span className="ss-tag" key={tag}>#{tag}</span>
              ))}
          </div>
        )}

        {/* actions */}
        <div className="ss-actions">
          {isPending && (
            <span className="ss-action-info">同步中...</span>
          )}
          {isToRead && !item.isUserAdded && !isPending && (
            <button className="ss-btn-primary" onClick={() => handleClaim(item)}>
              认领
            </button>
          )}
          {isClaimed && !isReported && !isPending && (
            <>
              <button className="ss-btn-primary" onClick={() => handleReport(item)}>
                汇报
              </button>
              <button className="ss-btn-danger-outline" onClick={() => handleUndoClaim(item)}>
                撤销认领
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
              撤销
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
          <p className="ss-pw-desc">输入访问密码以查看文献。</p>
          <form onSubmit={handlePasswordSubmit} className="ss-pw-form">
            <input
              type="password"
              className="ss-pw-input"
              placeholder="访问密码"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className="ss-btn-primary" disabled={passwordLoading}>
              {passwordLoading ? "验证中..." : "进入"}
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
            <span>{derivedItems.length} items</span>
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
            placeholder="筛选（标题、作者、DOI）"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              className="ss-filter-clear"
              onClick={() => { setFilterText(""); filterRef.current?.focus(); }}
            >
              清除
            </button>
          )}
          <button className="ss-guide-btn" onClick={() => setGuideOpen(true)}>
            使用指南
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
            全部 ({derivedItems.length})
          </button>
        </div>

        {/* add DOI form: to-read */}
        {(activeBucket === "to-read") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">添加新文献到 Zotero 文献库</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="DOI（必填，例如 10.1016/...）"
                value={addDoi}
                onChange={(e) => setAddDoi(e.target.value)}
              />
              <button className="ss-btn-primary" onClick={handleAddToDoiSubmit} disabled={addLoading}>
                {addLoading ? "提交中..." : "提交"}
              </button>
              <button className="ss-btn-secondary" onClick={() => { setBatchOpen(true); }}>
                批量导入
              </button>
            </div>
            {addError && <p className="ss-error-text">{addError}</p>}
            {addSuccess && <p className="ss-success-text">{addSuccess}</p>}
          </div>
        )}

        {/* add DOI form: claimed */}
        {(activeBucket === "claimed") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">添加新文献到 Zotero 文献库</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="DOI（必填，例如 10.1016/...）"
                value={claimedAddDoi}
                onChange={(e) => setClaimedAddDoi(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder="汇报人姓名（格式：San Zhang）"
                value={claimedAddName}
                onChange={(e) => setClaimedAddName(e.target.value)}
              />
              <span className="ss-upload-label">汇报日期</span>
              <input
                type="date"
                className="ss-upload-date"
                value={claimedAddDate}
                onChange={(e) => setClaimedAddDate(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <button className="ss-btn-primary" onClick={handleClaimedAddSubmit} disabled={claimedAddLoading}>
                {claimedAddLoading ? "提交中..." : "提交"}
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
            <div className="ss-empty">该分类下暂无文献。</div>
          )}
        </div>
      </div>

      {/* claim modal */}
      {claimTarget && (
        <div className="ss-overlay" onClick={() => setClaimTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">文献认领</h4>
            <p className="ss-dialog-paper">{claimTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder="汇报人姓名（格式：San Zhang）"
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
              <button className="ss-btn-secondary" onClick={() => setClaimTarget(null)}>取消</button>
              <button className="ss-btn-primary" onClick={submitClaim}>确认无误</button>
            </div>
          </div>
        </div>
      )}

      {/* report modal */}
      {reportTarget && (
        <div className="ss-overlay" onClick={() => setReportTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">文献汇报</h4>
            <p className="ss-dialog-paper">{reportTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder="汇报人姓名（格式：San Zhang）"
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
              <button className="ss-btn-secondary" onClick={() => setReportTarget(null)}>取消</button>
              <button className="ss-btn-primary" onClick={submitReport}>确认无误</button>
            </div>
          </div>
        </div>
      )}

      {/* batch modal */}
      {batchOpen && (
        <div className="ss-overlay" onClick={() => setBatchOpen(false)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">批量导入 DOI</h4>
            <textarea
              className="ss-batch-textarea"
              rows={8}
              placeholder="每行一个 DOI，或用分号、空格等分隔，例如：10.1234/abc ; 10.5678/def"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            {batchError && <p className="ss-error-text">{batchError}</p>}
            {batchSuccess && <p className="ss-success-text">{batchSuccess}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setBatchOpen(false)}>取消</button>
              <button className="ss-btn-primary" onClick={handleBatchSubmit} disabled={batchLoading}>
                {batchLoading ? "提交中..." : "提交"}
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
              <h3 className="ss-guide-title">使用指南</h3>
              <button className="ss-guide-close" onClick={() => setGuideOpen(false)}>&#215;</button>
            </div>
            <div className="ss-guide-body">
              <h5>一、认领文献</h5>
              <p>在⌈待阅读⌋ 区点击“认领”，输入汇报人姓名和汇报日期来认领文献，文献会自动移至 ⌈已认领⌋ 区。</p>
              <h5>二、添加文献</h5>
              <p>（1）在⌈待阅读⌋区输入单个文献的DOI并点击“提交”，完成添加新文献；也可使用批量导入 DOI 功能，即一次性添加多篇文献。</p>
              <p>（2）尚未纳入 Zotero 文献库的文献，汇报人需在⌈已认领⌋ 区输入单篇文献的DOI、汇报人姓名和汇报日期，文献会自动移至 ⌈已认领⌋ 区。</p>
              <h5>三、撤销文献</h5>
              <p>已认领的文献可点击“撤销认领”，退回⌈待阅读⌋ 区；新添加的文献可点击“撤销”，从Zotero文献库中删除。</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
