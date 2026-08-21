# dgddgd314.github.io

Astro-based personal blog.

## Routes

- `/` redirects to `/blog/`
- `/blog/` provides bento, list, and network post views
- `/blog/tags/` lists every tag; `/blog/tags/<tag>/` filters posts by tag
- `/blog/<slug>/` renders an individual post
- `/editor/` is a local Notion-style post editor

## Content

Posts are JSON documents in `src/content/blog/`. The content collection reads every `*.json` file recursively.

```json
{
  "version": 2,
  "meta": {
    "title": "Post title",
    "slug": "post-slug",
    "description": "Short summary",
    "pubDate": "2026-07-31",
    "category": "engineering",
    "tags": "astro, notes",
    "status": ["published"],
    "placement": ["main"]
  },
  "page": {},
  "blocks": []
}
```

`meta.category` is used when provided. Otherwise the folder path beneath `src/content/blog/` becomes the category, such as `engineering/post.json` to `engineering`.

Publication is controlled by `meta.status` and `meta.placement`:

- Only posts whose `status` contains `published` receive a public detail route.
- `placement: ["main"]` includes a published post in the main archive, tags, categories, recent posts, network view, and RSS.
- `placement: ["notice"]` includes a published post in the notice panel.
- A post may use both placements. A published post with no placement remains public but unlisted.
- `status: ["published", "encrypted"]` publishes the metadata and route while keeping only the body blocks encrypted.

For encrypted posts, the editor asks for a passphrase when `encrypted` is selected. JSON copy/save encrypts `blocks` with AES-GCM and exports `encryptedBlocks` instead; the passphrase is never included. Loading that JSON asks for the passphrase before editing. Removing `encrypted` after unlocking returns the next export to ordinary plaintext `blocks`.

The editor exports this JSON document. Save it beneath `src/content/blog/`, then run the Astro development server or build to include the post.
