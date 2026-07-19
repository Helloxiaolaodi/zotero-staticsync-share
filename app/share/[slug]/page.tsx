import { notFound } from "next/navigation";
import { fetchSharedCollectionBySlug, deriveLiteratureItems, hasShareAccess } from "@/lib/share";
import type { DerivedLiteratureItem, SharedCollectionRecord } from "@/lib/types";
import ShareClient from "./share-client";

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const slug = decodeURIComponent((resolved.slug || "").trim());
  const record = await fetchSharedCollectionBySlug(slug);
  if (!record) notFound();

  const items = deriveLiteratureItems(record.literature_data) as DerivedLiteratureItem[];
  const accessGranted = await hasShareAccess(slug, record.password);

  return (
    <ShareClient
      record={record as SharedCollectionRecord}
      items={items}
      slug={slug}
      initialAccess={accessGranted}
    />
  );
}
