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
  deriveLiteratureItems,
} from "@/lib/share-client";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import type {
  CollaborationActionType,
  DerivedLiteratureItem,
  PendingClientAction,
  SharedCollectionRecord,
  SharedLiteratureItem,
  WorkflowBucket,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

const BUCKET_ORDER: WorkflowBucket[] = ["to-read", "claimed", "reported"];

function clientId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  i18n dictionary                                                   */
/* ------------------------------------------------------------------ */

type Lang = "zh" | "en";

const I18N: Record<Lang, Record<string, string>> = {
  zh: {
    "tab.to-read": "待阅读",
    "tab.claimed": "已认领",
    "tab.reported": "已汇报",
    "pw.desc": "输入访问密码以查看文献。",
    "pw.placeholder": "访问密码",
    "pw.submit": "进入",
    "pw.submitting": "验证中...",
    "header.subtitle": "本页文献由 Zotero 群组自动同步，并按「已汇报 / 已认领 / 待阅读」分类。汇报人可在「待阅读」区认领文献，另外在「已认领」区和「待阅读」区均可添加新文献到Zotero文献库。详细使用方法可点击「使用指南」按钮。",
    "filter.placeholder": "筛选（标题、作者、DOI）",
    "filter.clear": "清除",
    "guide.btn": "使用指南",
    "guide.title": "使用指南",
    "guide.h5.1": "一、认领文献",
    "guide.p.1": "在「待阅读」区点击「认领」，输入汇报人姓名和汇报日期来认领文献，文献会自动移至「已认领」区。",
    "guide.h5.2": "二、添加文献",
    "guide.p.2a": "（1）在「待阅读」区输入单个文献的DOI并点击「提交」，完成添加新文献；也可使用批量导入 DOI 功能，即一次性添加多篇文献。",
    "guide.p.2b": "（2）尚未纳入 Zotero 文献库的文献，汇报人需在「已认领」区输入单篇文献的DOI、汇报人姓名和汇报日期，文献会自动移至「已认领」区。",
    "guide.h5.3": "三、撤销文献",
    "guide.p.3": "已认领的文献可点击「撤销认领」，退回「待阅读」区；已汇报的文献可点击「撤销汇报」，退回「已认领」区；新添加的文献可点击「撤销」，从Zotero文献库中删除。",
    "upload.title": "添加新文献到 Zotero 文献库",
    "upload.doi.placeholder": "DOI（必填，例如 10.1016/...）",
    "upload.name.placeholder": "汇报人姓名（格式：San Zhang）",
    "upload.date.label": "汇报日期",
    "upload.submit": "提交",
    "upload.submitting": "提交中...",
    "upload.batch": "批量导入",
    "batch.title": "批量导入 DOI",
    "batch.placeholder": "每行一个 DOI，或用分号、空格等分隔，例如：10.1234/abc ; 10.5678/def",
    "batch.cancel": "取消",
    "claim.title": "文献认领",
    "claim.name.placeholder": "汇报人姓名（格式：San Zhang）",
    "claim.confirm": "确认无误",
    "claim.cancel": "取消",
    "report.title": "文献汇报",
    "error.name.required": "请输入汇报人姓名。",
    "error.name.format": "姓名格式应为：名 姓（如 San Zhang），每个词首字母大写。",
    "error.date.format": "请输入有效日期（YYYY-MM-DD）。",
    "error.doi.format": "请输入 DOI，且必须以 10. 开头。",
    "error.action.failed": "操作失败，请重试。",
    "success.added": "提交成功，文献已加入 Zotero 群组。",
    "error.batch.empty": "请输入至少一个有效 DOI（以 10. 开头）。",
    "success.batch": "批量提交成功！",
    "badge.added": "已添加",
    "badge.overdue": "已过期",
    "action.claim": "认领",
    "action.report": "汇报",
    "action.undo.claim": "撤销认领",
    "action.undo.report": "撤销汇报",
    "action.undo": "撤销",
    "action.syncing": "同步中...",
    "chip.presenter": "汇报人",
    "chip.date": "汇报日期",
    "view.source": "查看原文",
    "empty": "该分类下暂无文献。",
  },
  en: {
    // Tab labels
    "tab.to-read": "Unread",
    "tab.claimed": "Assigned",
    "tab.reported": "Reported",
    // Password gate
    "pw.desc": "Enter the access password to view the collection.",
    "pw.placeholder": "Password",
    "pw.submit": "Enter",
    "pw.submitting": "Verifying...",
    // Header
    "header.subtitle": "This page is auto-synced from a Zotero group library and organized into Reported, Assigned, and Unread. Presenters can claim papers in the Unread section, and new papers can be added to the Zotero library from both the Assigned and Unread sections. Click the User Guide button for detailed instructions.",
    // Toolbar
    "filter.placeholder": "Filter (title, author, DOI)",
    "filter.clear": "Clear",
    "guide.btn": "User Guide",
    // Guide panel
    "guide.title": "User Guide",
    "guide.h5.1": "1. Claim Papers",
    "guide.p.1": 'In the Unread section, click "Claim" and enter the presenter name and report date. The paper will move to Assigned automatically.',
    "guide.h5.2": "2. Add Papers",
    "guide.p.2a": '(1) In the Unread section, enter a DOI and click "Submit" to add a new paper. You can also use the Batch Import DOI function to add multiple papers at once.',
    "guide.p.2b": "(2) For papers not yet in the Zotero library, presenters can enter the DOI, presenter name, and report date in the Assigned section. The paper will move to Assigned automatically.",
    "guide.h5.3": "3. Undo Actions",
    "guide.p.3": 'Claimed papers can be "Undo claim" to return to Unread. Reported papers can be "Undo report" to return to Assigned. Newly added papers can be "Undo" to delete from the Zotero library.',
    // Upload forms
    "upload.title": "Add new papers to Zotero library",
    "upload.doi.placeholder": "DOI (required, e.g. 10.1016/...)",
    "upload.name.placeholder": "Presenter name (e.g. San Zhang)",
    "upload.date.label": "Report date",
    "upload.submit": "Submit",
    "upload.submitting": "Submitting...",
    "upload.batch": "Batch Import",
    // Batch modal
    "batch.title": "Batch Import DOI",
    "batch.placeholder": "One DOI per line, or separate with semicolons, e.g.: 10.1234/abc ; 10.5678/def",
    "batch.cancel": "Cancel",
    // Claim modal
    "claim.title": "Claim Paper",
    "claim.name.placeholder": "Presenter name (e.g. San Zhang)",
    "claim.confirm": "Confirm",
    "claim.cancel": "Cancel",
    // Report modal
    "report.title": "Report Paper",
    // Error / success messages
    "error.name.required": "Please enter the presenter name.",
    "error.name.format": "Name format: First Last (e.g. San Zhang), each word capitalized.",
    "error.date.format": "Please enter a valid date (YYYY-MM-DD).",
    "error.doi.format": "Please enter a DOI starting with 10.",
    "error.action.failed": "Action failed. Please try again.",
    "success.added": "Submitted. The paper has been added to the Zotero group.",
    "error.batch.empty": "Please enter at least one valid DOI (starting with 10.).",
    "success.batch": "Batch import successful!",
    // Badges
    "badge.added": "Added",
    "badge.overdue": "Overdue",
    // Card actions
    "action.claim": "Claim",
    "action.report": "Report",
    "action.undo.claim": "Undo claim",
    "action.undo.report": "Undo report",
    "action.undo": "Undo",
    "action.syncing": "Syncing...",
    // Reporter chips
    "chip.presenter": "Presenter",
    "chip.date": "Report date",
    // View source
    "view.source": "View source",
    // Empty
    "empty": "No papers in this category.",
  },
};

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
  const overridesRef = useRef<Map<string, WorkflowBucket>>(new Map());

  /* Supabase Realtime subscription ----------------------------------- */
  useEffect(() => {
    if (!access) return;
    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`share-${slug}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shared_collections", filter: `slug=eq.${slug}` },
        (payload) => {
          const newData = payload.new as SharedCollectionRecord | undefined;
          if (newData?.literature_data) {
            setDerivedItems(() => {
              const serverItems = deriveLiteratureItems(newData.literature_data as SharedLiteratureItem[]);
              return serverItems.map((serverItem) => {
                const override = overridesRef.current.get(serverItem.key!);
                if (override) {
                  if (serverItem.bucket === override) {
                    overridesRef.current.delete(serverItem.key!);
                  } else {
                    return { ...serverItem, bucket: override };
                  }
                }
                return serverItem;
              });
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access, slug]);

  /* Hourly re-derive for date-based auto-transition ---------------- */
  useEffect(() => {
    if (!access) return;
    const timer = setInterval(() => {
      setDerivedItems((prev) =>
        prev.map((item) => {
          const rederived = deriveLiteratureItem(item);
          const override = overridesRef.current.get(item.key!);
          if (override) {
            if (rederived.bucket === override) {
              overridesRef.current.delete(item.key!);
            } else {
              return { ...rederived, bucket: override };
            }
          }
          return rederived;
        }),
      );
    }, 3600_000);
    return () => clearInterval(timer);
  }, [access]);

  /* UI state -------------------------------------------------------- */
  const [activeBucket, setActiveBucket] = useState<WorkflowBucket>("to-read");
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

  /* global action error --------------------------------------------- */
  const [actionError, setActionError] = useState("");

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

  /* guide panel / i18n --------------------------------------------- */
  const [lang, setLang] = useState<Lang>("en");
  const t = (key: string): string => I18N[lang][key] || key;
  const [guideOpen, setGuideOpen] = useState(false);

  const filterRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ */
  /*  derived lookups                                                   */
  /* ------------------------------------------------------------------ */

  const BUCKET_MAP = useMemo<Record<WorkflowBucket, string>>(() => ({
    "to-read": t("tab.to-read"),
    claimed: t("tab.claimed"),
    reported: t("tab.reported"),
  }), [lang]);

  const bucketCounts = useMemo(() => {
    const m: Record<WorkflowBucket, number> = { "to-read": 0, claimed: 0, reported: 0 };
    for (const item of derivedItems) m[item.bucket] = (m[item.bucket] || 0) + 1;
    return m;
  }, [derivedItems]);

  const filteredItems = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const source = derivedItems.filter((item) => item.bucket === activeBucket);

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
      setPasswordError(lang === "zh" ? "网络错误，请重试。" : "Network error. Please try again.");
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
    overridesRef.current.set(key, toBucket);
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
    if (!claimName.trim()) { setClaimError(t("error.name.required")); return; }
    if (!/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(claimName.trim())) { setClaimError(t("error.name.format")); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate.trim())) { setClaimError(t("error.date.format")); return; }

    const key = claimTarget.key!;
    const item = claimTarget;
    setClaimTarget(null);
    setActionError("");
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
      setActionError(t("error.action.failed"));
    }
  }

  async function handleUndoClaim(item: DerivedLiteratureItem) {
    const key = item.key!;
    setActionError("");
    moveItemToBucket(key, "to-read");
    try {
      await postAction("undo_claim", { item_key: key, item_title: item.normalizedTitle });
    } catch {
      moveItemToBucket(key, "claimed");
      setActionError(t("error.action.failed"));
    }
  }

  async function handleUndoReport(item: DerivedLiteratureItem) {
    const key = item.key!;
    setActionError("");
    moveItemToBucket(key, "claimed");
    try {
      await postAction("undo_report", { item_key: key, item_title: item.normalizedTitle });
    } catch {
      moveItemToBucket(key, "reported");
      setActionError(t("error.action.failed"));
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
    if (!reportName.trim()) { setReportError(t("error.name.required")); return; }
    if (!/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(reportName.trim())) { setReportError(t("error.name.format")); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate.trim())) { setReportError(t("error.date.format")); return; }

    const key = reportTarget.key!;
    const item = reportTarget;
    setReportTarget(null);
    setActionError("");
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
      setActionError(t("error.action.failed"));
    }
  }

  async function handleUndoAdd(item: DerivedLiteratureItem) {
    const key = item.key;
    if (!key) return;
    overridesRef.current.delete(key);
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
      setAddError(t("error.doi.format"));
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
      updateLocalItemTempKey(cid, { actionId: action.id });
      setAddDoi("");
      setAddSuccess(t("success.added"));
      setTimeout(() => setAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setAddError(lang === "zh" ? "提交失败：" + msg : "Failed: " + msg);
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
      setClaimedAddError(t("error.doi.format"));
      return;
    }
    if (!claimedAddName.trim()) { setClaimedAddError(t("error.name.required")); return; }
    if (!/^[A-Z][a-z]+\s[A-Z][a-z]+$/.test(claimedAddName.trim())) { setClaimedAddError(t("error.name.format")); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimedAddDate.trim())) { setClaimedAddError(t("error.date.format")); return; }

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
      setClaimedAddSuccess(t("success.added"));
      setTimeout(() => setClaimedAddSuccess(""), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      resolvePending({ clientId: cid, actionType: "add_by_doi", doi, createdAt: "", status: "pending" }, msg);
      setClaimedAddError(lang === "zh" ? "提交失败：" + msg : "Failed: " + msg);
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
      setBatchError(t("error.batch.empty"));
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
      setBatchError(lang === "zh" ? `${failed} 个 DOI 提交失败。` : `${failed} DOI(s) failed to submit.`);
    } else {
      setBatchSuccess(t("success.batch"));
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
    return <span className={`ss-badge ${colors[bucket]}`}>{BUCKET_MAP[bucket]}</span>;
  }

  function renderCard(item: DerivedLiteratureItem, index: number, seqNumber: number) {
    const isHighlighted = !!filterText.trim().toLowerCase();
    const abstractNote =
      item.abstractNote || item.description || item.summary || "";
    const hasAbstract = abstractNote.length > 0;
    const isExpanded = expandedKeys.has(item.key || `idx_${index}`);
    const isPending = pendingActions.some(
      (p) =>
        p.clientId === item.key &&
        p.actionType === "add_by_doi" &&
        (p.status === "pending" || p.status === "submitted"),
    );
    const isToRead = activeBucket === "to-read";
    const isClaimed = activeBucket === "claimed";
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
          <span className="ss-card-seq">{seqNumber}.</span>
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
          {item.isUserAdded && <span className="ss-badge ss-badge-amber">{t("badge.added")}</span>}
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
            <span className="ss-doi-text">DOI: {item.normalizedDoi}</span>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="ss-meta-link">
              {t("view.source")}
            </a>
          )}
        </div>

        {/* reporter row — only for claimed/reported items */}
        {(item.bucket !== "to-read") && (item.reporterName || item.reportDate || item.claimantName || item.claimDate) && (
          <div className="ss-reporter-row">
            {(item.reporterName || item.claimantName) && (
              <span className="ss-chip">{t("chip.presenter")}: {item.reporterName || item.claimantName}</span>
            )}
            {(item.reportDate || item.claimDate) && (
              <span className="ss-chip">{t("chip.date")}: {item.reportDate || item.claimDate}</span>
            )}
          </div>
        )}

        {/* abstract */}
        {hasAbstract && (
          <div className={`ss-abstract${isExpanded ? " ss-abstract-open" : ""}`}>
            {abstractNote}
          </div>
        )}

        {/* actions */}
        <div className="ss-actions">
          {isPending && (
            <span className="ss-action-info">{t("action.syncing")}</span>
          )}
          {isToRead && !item.isUserAdded && !isPending && (
            <button className="ss-btn-primary" onClick={() => handleClaim(item)}>
              {t("action.claim")}
            </button>
          )}
          {isClaimed && !isReported && !isPending && (
            <>
              <button className="ss-btn-primary" onClick={() => handleReport(item)}>
                {t("action.report")}
              </button>
              <button className="ss-btn-danger-outline" onClick={() => handleUndoClaim(item)}>
                {t("action.undo.claim")}
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
              {t("action.undo")}
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
          <p className="ss-pw-desc">{t("pw.desc")}</p>
          <form onSubmit={handlePasswordSubmit} className="ss-pw-form">
            <input
              type="password"
              className="ss-pw-input"
              placeholder={t("pw.placeholder")}
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className="ss-btn-primary" disabled={passwordLoading}>
              {passwordLoading ? t("pw.submitting") : t("pw.submit")}
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
          <p className="ss-subtitle">{t("header.subtitle")}</p>
        </header>

        {/* toolbar */}
        <div className="ss-toolbar">
          <input
            ref={filterRef}
            type="text"
            className="ss-filter-input"
            placeholder={t("filter.placeholder")}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              className="ss-filter-clear"
              onClick={() => { setFilterText(""); filterRef.current?.focus(); }}
            >
              {t("filter.clear")}
            </button>
          )}
         <button className="ss-guide-btn" onClick={() => setGuideOpen(true)}>
            {t("guide.btn")}
          </button>
          <button className="ss-lang-btn" onClick={() => setLang(lang === "zh" ? "en" : "zh")} title="Switch language">
            {lang === "zh" ? "EN" : "中"}
          </button>
        </div>
        {actionError && <p className="ss-error-text">{actionError}</p>}

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
                {BUCKET_MAP[bucket]} ({count})
              </button>
            );
          })}
        </div>

        {/* add DOI form: to-read */}
        {(activeBucket === "to-read") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">{t("upload.title")}</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder={t("upload.doi.placeholder")}
                value={addDoi}
                onChange={(e) => setAddDoi(e.target.value)}
              />
              <button className="ss-btn-primary" onClick={handleAddToDoiSubmit} disabled={addLoading}>
                {addLoading ? t("upload.submitting") : t("upload.submit")}
              </button>
              <button className="ss-btn-secondary" onClick={() => { setBatchOpen(true); }}>
                {t("upload.batch")}
              </button>
            </div>
            {addError && <p className="ss-error-text">{addError}</p>}
            {addSuccess && <p className="ss-success-text">{addSuccess}</p>}
          </div>
        )}

        {/* add DOI form: claimed */}
        {(activeBucket === "claimed") && (
          <div className="ss-upload">
            <h4 className="ss-upload-title">{t("upload.title")}</h4>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder={t("upload.doi.placeholder")}
                value={claimedAddDoi}
                onChange={(e) => setClaimedAddDoi(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <input
                type="text"
                className="ss-upload-input"
                placeholder={t("upload.name.placeholder")}
                value={claimedAddName}
                onChange={(e) => setClaimedAddName(e.target.value)}
              />
              <span className="ss-upload-label">{t("upload.date.label")}</span>
              <input
                type="date"
                className="ss-upload-date"
                lang={lang === "zh" ? "zh-CN" : "en-US"}
                value={claimedAddDate}
                onChange={(e) => setClaimedAddDate(e.target.value)}
              />
            </div>
            <div className="ss-upload-row">
              <button className="ss-btn-primary" onClick={handleClaimedAddSubmit} disabled={claimedAddLoading}>
                {claimedAddLoading ? t("upload.submitting") : t("upload.submit")}
              </button>
            </div>
            {claimedAddError && <p className="ss-error-text">{claimedAddError}</p>}
            {claimedAddSuccess && <p className="ss-success-text">{claimedAddSuccess}</p>}
          </div>
        )}

        {/* literature cards */}
        <div className="ss-card-list">
          {filteredItems.length ? (
            filteredItems.map((item, index) => renderCard(item, index, index + 1))
          ) : (
            <div className="ss-empty">{t("empty")}</div>
          )}
        </div>
      </div>

      {/* claim modal */}
      {claimTarget && (
        <div className="ss-overlay" onClick={() => setClaimTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">{t("claim.title")}</h4>
            <p className="ss-dialog-paper">{claimTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder={t("claim.name.placeholder")}
              value={claimName}
              onChange={(e) => setClaimName(e.target.value)}
              autoFocus
            />
            <input
              type="date"
              className="ss-dialog-input"
              lang={lang === "zh" ? "zh-CN" : "en-US"}
              value={claimDate}
              onChange={(e) => setClaimDate(e.target.value)}
            />
            {claimError && <p className="ss-error-text">{claimError}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setClaimTarget(null)}>{t("claim.cancel")}</button>
              <button className="ss-btn-primary" onClick={submitClaim}>{t("claim.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* report modal */}
      {reportTarget && (
        <div className="ss-overlay" onClick={() => setReportTarget(null)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">{t("report.title")}</h4>
            <p className="ss-dialog-paper">{reportTarget.normalizedTitle}</p>
            <input
              type="text"
              className="ss-dialog-input"
              placeholder={t("claim.name.placeholder")}
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              autoFocus
            />
            <input
              type="date"
              className="ss-dialog-input"
              lang={lang === "zh" ? "zh-CN" : "en-US"}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            {reportError && <p className="ss-error-text">{reportError}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setReportTarget(null)}>{t("claim.cancel")}</button>
              <button className="ss-btn-primary" onClick={submitReport}>{t("claim.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* batch modal */}
      {batchOpen && (
        <div className="ss-overlay" onClick={() => setBatchOpen(false)}>
          <div className="ss-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 className="ss-dialog-title">{t("batch.title")}</h4>
            <textarea
              className="ss-batch-textarea"
              rows={8}
              placeholder={t("batch.placeholder")}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            {batchError && <p className="ss-error-text">{batchError}</p>}
            {batchSuccess && <p className="ss-success-text">{batchSuccess}</p>}
            <div className="ss-dialog-actions">
              <button className="ss-btn-secondary" onClick={() => setBatchOpen(false)}>{t("batch.cancel")}</button>
              <button className="ss-btn-primary" onClick={handleBatchSubmit} disabled={batchLoading}>
                {batchLoading ? t("upload.submitting") : t("upload.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* guide panel */}
      {guideOpen && (
        <div className="ss-overlay ss-guide-overlay" onClick={() => setGuideOpen(false)}>
          <div className="ss-guide-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ss-guide-header">
              <h3 className="ss-guide-title">{t("guide.title")}</h3>
              <button className="ss-guide-close" onClick={() => setGuideOpen(false)}>&#215;</button>
            </div>
            <div className="ss-guide-body">
              <h5>{t("guide.h5.1")}</h5>
              <p>{t("guide.p.1")}</p>
              <h5>{t("guide.h5.2")}</h5>
              <p>{t("guide.p.2a")}</p>
              <p>{t("guide.p.2b")}</p>
              <h5>{t("guide.h5.3")}</h5>
              <p>{t("guide.p.3")}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}