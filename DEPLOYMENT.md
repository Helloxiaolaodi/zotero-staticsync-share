# Deployment Steps

## 1. Prepare Supabase

Run the plugin table schema first in your Zotero StaticSync project:

- `doc/supabase-schema.sql`

Then add anonymous read access for the public share frontend:

```sql
create policy "Enable read for anonymous users"
on public.shared_collections
for select
to anon
using (true);
```

## 2. Set environment variables

Create `.env.local` for local development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
```

## 3. Run locally

```bash
npm install
npm run dev
```

Visit:

```text
http://localhost:3000/share/<your-slug>
```

## 4. Push to GitHub

Create a new repository, then push this project.

## 5. Deploy to Vercel

1. Import the GitHub repository into Vercel.
2. Add the same two environment variables in Vercel Project Settings.
3. Deploy.

## 6. Update Zotero plugin settings

In Zotero StaticSync preferences, set:

```text
Share URL template = https://your-project.vercel.app/share/{id}
```

The plugin will normally replace `{id}` with the returned `slug`.

## 7. Test the full loop

1. Push a collection from Zotero.
2. Copy the generated share link.
3. Open it in the browser.
4. Confirm the page renders the collection and literature list.
