import { NextRequest, NextResponse } from "next/server";
import { getCookieName, signPassword, fetchSharedCollectionBySlug } from "@/lib/share";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = (body.slug || "").trim();
    const password = (body.password || "").trim();

    if (!slug || !password) {
      return NextResponse.json({ ok: false, error: "Slug and password are required." }, { status: 400 });
    }

    const record = await fetchSharedCollectionBySlug(slug);
    if (!record?.password) {
      return NextResponse.json({ ok: false, error: "This share does not require a password." }, { status: 400 });
    }

    if (password !== record.password) {
      return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(getCookieName(slug), signPassword(slug, password), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: `/share/${slug}`,
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error." }, { status: 500 });
  }
}
