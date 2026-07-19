import { notFound } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import type { SharedCollectionRecord, SharedLiteratureItem } from "@/lib/types";

function renderMetaParts(item: SharedLiteratureItem): string[] {
  return [item.publicationTitle, item.date, item.doi ? `DOI: ${item.doi}` : ""]
    .filter(Boolean) as string[];
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const slug = decodeURIComponent((resolved.slug || "").trim());
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("shared_collections")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Supabase query failed for shared collection", {
      slug,
      error,
    });
    notFound();
  }

  if (!data) {
    console.error("Shared collection not found", { slug });
    notFound();
  }

  const record = data as SharedCollectionRecord;
  const literatureList = record.literature_data || [];

  return (
    <main>
      <div className="page-shell">
        <header className="page-header">
          <h1 className="page-title">
            {record.collection_name || record.title || "Untitled Collection"}
          </h1>
          <div className="meta-row">
            {record.collection_path_text ? (
              <span>{record.collection_path_text}</span>
            ) : null}
            <span>{record.item_count || literatureList.length} items</span>
            {record.library_name ? <span>{record.library_name}</span> : null}
            {record.updated_at ? (
              <span>Updated {new Date(record.updated_at).toLocaleString()}</span>
            ) : null}
          </div>
        </header>

        {literatureList.length ? (
          <section className="article-list">
            {literatureList.map((item, index) => {
              const metaParts = renderMetaParts(item);
              return (
                <article className="article-card" key={`${item.key || item.slug || "item"}-${index}`}>
                  <h2 className="article-title">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.title || "Untitled Item"}
                      </a>
                    ) : (
                      item.title || "Untitled Item"
                    )}
                  </h2>

                  {item.creators?.length ? (
                    <p className="article-authors">{item.creators.join(", ")}</p>
                  ) : null}

                  {metaParts.length ? (
                    <div className="article-meta">
                      {metaParts.map((part) => (
                        <span key={part}>{part}</span>
                      ))}
                    </div>
                  ) : null}

                  {item.summary || item.description || item.abstractNote ? (
                    <p className="article-summary">
                      {item.summary || item.description || item.abstractNote}
                    </p>
                  ) : null}

                  {item.tags?.length ? (
                    <div className="tag-list">
                      {item.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <section className="empty-state">No literature items were found in this shared collection.</section>
        )}
      </div>
    </main>
  );
}
