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
    "badge": "note"
  },
  "page": {},
  "blocks": []
}
```

`meta.category` is used when provided. Otherwise the folder path beneath `src/content/blog/` becomes the category, such as `engineering/post.json` to `engineering`.

The editor exports this same JSON document. Save it beneath `src/content/blog/`, then run the Astro development server or build to include the post.