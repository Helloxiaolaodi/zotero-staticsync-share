# Zotero StaticSync Share

Next.js frontend for displaying Zotero StaticSync share pages backed by Supabase, with bilingual (zh/en) collaboration support and password-gated access.

## Features

- Reads a `shared_collections` row from Supabase by `slug`
- **Bilingual UI** — full Chinese/English toggle (language switch button in toolbar)
- Password-gated share pages when a password is set on the collection
- Static read-only view when collaboration is disabled
- Collaboration dashboard when `is_collaborative = true`:
  - Workflow tabs: 待阅读/已认领/已汇报 (Chinese) ↔ Unread/Assigned/Reported (English)
  - Keyword filter (title, author, DOI) with bilingual placeholder
  - Claim a paper (presenter name + report date) → moves to Assigned
  - Undo claim → returns to Unread
  - Report a paper (presenter name + report date) → moves to Reported
  - Undo report → returns to Assigned (removes report tags only, keeps claim tags)
  - Add paper by DOI (single or batch import) — article metadata is resolved immediately via Crossref API so new items show title/authors on the web
  - Cancel a pending DOI add
  - Undo add (remove externally added items)
- **Tag-based auto-transition**: claimed items whose report date has passed automatically appear in the Reported tab
- **Instant web updates**: claim/report/add-by-DOI actions are immediately written to `literature_data` in Supabase (requires `SUPABASE_SERVICE_ROLE_KEY` environment variable). Add-by-DOI resolves article metadata via Crossref API so new items display title/authors immediately.
- **Supabase Realtime**: instant data updates via WebSocket when Zotero syncs new data
- **Sequence numbers**: each card shows its 1-based index before the title
- User Guide panel with detailed bilingual instructions
- Subtitle line under header describing page purpose (bilingual)
- Reporter/presenter chips showing name and date for claimed/reported items
- No Zotero tags displayed in Unread section; only presenter chips in Assigned/Reported
- Academic formatting: first 3 authors + et al., normalized dates, italic journals, DOI links, "查看原文"/"View source" links, line-clamped titles, status badges
- Responsive layout with improved typography

## Plugin features

The Zotero StaticSync plugin provides:

- **Sync Collection** — right-click a Zotero collection to push items to Supabase (JSON)
- **Export CSV** — right-click a collection to export items as a CSV file with customizable columns (default: sequence number + title). Available columns: key, itemType, title, authors, publicationTitle, year, date, doi, url, abstractNote, tags, collectionName, libraryName
- **Collaborative sync** — background polling for web-to-Zotero bidirectional sync

## How it works

Web-side collaboration actions are written into the `shared_collection_actions` table. The Zotero StaticSync plugin polls this table and applies actions locally.

### Categorization logic

Items are categorized into workflow buckets by checking, in priority order:

1. `readingStatus` field (set by the plugin to the leaf collection name)
2. Leaf collection name from `collectionPath`
3. `collectionName` field
4. Zotero tags (`auto_reported`, `claimed_by:`, `report_date:`, `claim_date:`, etc.)

When a claimed item has a `claim_date:` or `report-date:` tag whose date is today or earlier, it is automatically promoted to the "reported" bucket.

The matching supports both Chinese (已汇报/已认领/待阅读) and English (Reported/Assigned/Unread) collection names.

### Real-time updates

The frontend subscribes to Supabase Realtime (`postgres_changes` on `shared_collections`) so that when the Zotero plugin pushes updated data, the web page refreshes instantly via WebSocket. A 1-hour fallback re-derives items for date-based auto-transitions.

## Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
# Required for instant web updates (claim/report). Found in Supabase Dashboard → Settings → API → service_role key.
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key
```

## Supabase requirements

You must have the `shared_collections` table created (run `doc/supabase-schema.sql` from the plugin repo).

Minimum SQL policies required:

```sql
-- Read access for the shared collections
create policy "Enable read for anonymous users"
on public.shared_collections
for select
to anon
using (true);

-- Write access for the action queue (collaboration features)
create policy "Enable insert for anon on actions"
on public.shared_collection_actions
for insert
to anon
with check (true);

create policy "Enable update for anon on actions"
on public.shared_collection_actions
for update
to anon
using (true)
with check (true);
```

## Local development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/share/your-shared-collection-slug
```

## Deployment

Recommended deployment target: Vercel.

1. Push this project to a GitHub repository.
2. Import the repository into Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (required for instant web updates on claim/report actions) in Vercel environment variables.
4. Deploy.
5. Use your deployed URL in Zotero, for example:

```text
https://your-project.vercel.app/share/{id}
```

## Password-gated shares

If the `shared_collections.password` column is set, the share page will show a password gate. Entering the correct password sets an httpOnly cookie valid for 7 days. No additional user accounts are required. The password gate UI is bilingual (Chinese/English).

## Collaboration mode

Set `is_collaborative = true` for the collection row to enable the workflow dashboard. When enabled, users on the share page can claim, report, undo claim, undo report, add by DOI, and undo add. Each action creates a row in `shared_collection_actions` that the Zotero plugin polls and processes locally.

The Zotero StaticSync plugin currently prefers the returned `slug`, so `{id}` will typically become something like:

```text
shared-collection-4718bf4a
```