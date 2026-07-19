export default function HomePage() {
  return (
    <main>
      <div className="page-shell">
        <section className="home-card">
          <h1 className="home-title">StaticSync Share</h1>
          <p>
            This project is a minimal public share frontend for Zotero StaticSync
            data stored in Supabase.
          </p>
          <ol className="home-list">
            <li>Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.</li>
            <li>Deploy this project to Vercel.</li>
            <li>Open `/share/your-shared-collection-slug`.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
