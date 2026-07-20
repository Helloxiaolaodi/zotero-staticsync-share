import { NextRequest, NextResponse } from "next/server";
import {
  hasShareAccess,
  fetchSharedCollectionBySlug,
  insertShareAction,
  cancelPendingShareAction,
  validateActionType,
  applyActionToLiteratureData,
  fetchActionById,
} from "@/lib/share";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug: string = (body.slug || "").trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Slug is required." }, { status: 400 });
    }

    const record = await fetchSharedCollectionBySlug(slug);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Collection not found." }, { status: 404 });
    }
    if (!record.is_collaborative) {
      return NextResponse.json({ ok: false, error: "Collaboration is not enabled for this share." }, { status: 403 });
    }
    if (!(await hasShareAccess(slug, record.password))) {
      return NextResponse.json({ ok: false, error: "Password required." }, { status: 401 });
    }

    const action = body.action;
    if (!action || !action.action_type || !validateActionType(action.action_type)) {
      return NextResponse.json({ ok: false, error: "Valid action_type is required." }, { status: 400 });
    }

    const actionInsert = {
      action_type: action.action_type,
      source_slug: slug,
      item_key: action.item_key || null,
      item_title: action.item_title || null,
      doi: action.doi || null,
      reporter_name: action.reporter_name || null,
      report_date: action.report_date || null,
    };

    const created = await insertShareAction(actionInsert);

    // Immediately apply the action to literature_data so the web shows the
    // change without waiting for the Zotero plugin to poll and re-sync.
    try {
      const result = await applyActionToLiteratureData(
        slug,
        action.action_type,
        action.item_key,
        action.reporter_name,
        action.report_date,
        action.doi || null,
      );
      if (!result.success) {
        console.warn("applyActionToLiteratureData did not modify data:", result.error);
        return NextResponse.json({ ok: false, error: result.error || "Failed to apply action to literature_data." }, { status: 500 });
      }
    } catch (applyErr) {
      // Log the error for debugging — the Zotero plugin will still process it later
      console.error("applyActionToLiteratureData failed:", applyErr instanceof Error ? applyErr.message : String(applyErr));
      return NextResponse.json({ ok: false, error: "Failed to apply action to literature_data." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: created });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const slug: string = (body.slug || "").trim();
    const actionId: number = Number(body.actionId);
    if (!slug || !actionId) {
      return NextResponse.json({ ok: false, error: "Slug and actionId are required." }, { status: 400 });
    }

    const record = await fetchSharedCollectionBySlug(slug);
    if (!record) {
      return NextResponse.json({ ok: false, error: "Collection not found." }, { status: 404 });
    }
    if (!(await hasShareAccess(slug, record.password))) {
      return NextResponse.json({ ok: false, error: "Password required." }, { status: 401 });
    }

    await cancelPendingShareAction(actionId);

    // For add_by_doi actions that were cancelled, remove the item from literature_data.
    // Undo actions (undo_claim, undo_report, undo_add) are submitted via POST, not DELETE.
    try {
      const actionRecord = await fetchActionById(actionId);
      if (actionRecord?.action_type === "add_by_doi" && actionRecord.item_key) {
        await applyActionToLiteratureData(slug, "undo_add", actionRecord.item_key);
      }
    } catch {
      // Non-critical: the item will be cleaned up by the Zotero plugin later
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
