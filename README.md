# dgddgd314.github.io

Astro-based personal blog for `dgddgd314`.

## Routes

- `/` redirects to `/blog/`
- `/blog/` renders the blog archive
- `/blog/:slug/` renders a post
- `/blog/tag/:tag/` renders a tag-filtered archive
- `/rss.xml` exposes the blog feed

## Content

Blog posts live in `src/content/blog`.

Supported frontmatter:

```yaml
title: "Post title"
description: "Post description"
pubDate: "2026-01-01"
category: "category-name"
tags: ["tag-a", "tag-b"]
```

If `category` is omitted, posts are grouped as `uncategorized` unless they are stored under a category folder.