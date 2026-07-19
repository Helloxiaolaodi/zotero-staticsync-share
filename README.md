# Zotero StaticSync Share

This is a minimal Next.js frontend for displaying public Zotero StaticSync share pages backed by Supabase.

## What it does

- Reads one `shared_collections` row from Supabase by `slug`
- Renders collection metadata and `literature_data`
- Works with the current Zotero StaticSync Supabase payload format

## Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
```

## Supabase requirements

You must already have the `shared_collections` table created.

For public read access, run this SQL in Supabase:

```sql
create policy "Enable read for anonymous users"
on public.shared_collections
for select
to anon
using (true);
```

If your table already has RLS enabled, this policy is required for the frontend to read records with the anon key.

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

The Zotero StaticSync plugin currently prefers the returned `slug`, so `{id}` will typically become something like:

```text
shared-collection-4718bf4a
```

## Important limitation

This frontend is intentionally public and minimal.

If you want password-protected shares, do not expose whole rows directly to the browser. Add a server-side route or backend that validates the password before returning share data.
