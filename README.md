# Zotero StaticSync Share

Next.js frontend for displaying Zotero StaticSync share pages backed by Supabase, with optional collaboration support (claim / report / add-by-DOI workflows) and password-gated access.

## Features

- Reads a `shared_collections` row from Supabase by `slug`
- Password-gated share pages when a password is set on the collection
- Static read-only view when collaboration is disabled
- Collaboration dashboard when `is_collaborative = true`:
  - Workflow tabs: To Read / Claimed / Reported
  - Keyword filter (title, author, DOI)
  - Claim a paper (name + report date) -> moves to Claimed
  - Undo claim
  - Report a paper (name + date) -> moves to Reported
  - Add paper by DOI (single or batch import)
  - Cancel a pending DOI add
  - Undo add (remove externally added items)
- Academic formatting: first 3 authors + et al., normalized dates, italic journals, DOI links, "View source" links, line-clamped titles, status badges, reporter/claimant rows

## How it works

Web-side collaboration actions are written into the `shared_collection_actions` table. The Zotero StaticSync plugin polls this table and applies actions locally.

## Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
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
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel environment variables.
4. Deploy.
5. Use your deployed URL in Zotero, for example:

```text
https://your-project.vercel.app/share/{id}
```

## Password-gated shares

If the `shared_collections.password` column is set, the share page will show a password gate. Entering the correct password sets an httpOnly cookie valid for 7 days. No additional user accounts are required.

## Collaboration mode

Set `is_collaborative = true` for the collection row to enable the workflow dashboard. When enabled, users on the share page can claim, report, add by DOI, and undo those actions. Each action creates a row in `shared_collection_actions` that the Zotero plugin polls and processes locally.

The Zotero StaticSync plugin currently prefers the returned `slug`, so `{id}` will typically become something like:

```text
shared-collection-4718bf4a
```
