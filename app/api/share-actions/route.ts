import { NextRequest, NextResponse } from "next/server";
import {
  hasShareAccess,
  fetchSharedCollectionBySlug,
  insertShareAction,
  cancelPendingShareAction,
  validateActionType,
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
