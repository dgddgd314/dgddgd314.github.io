import type { CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;
export type BlogPlacement = "main" | "notice";

export function isPublished(post: BlogPost): boolean {
  return post.data.status.includes("published");
}

export function hasPlacement(post: BlogPost, placement: BlogPlacement): boolean {
  return post.data.placement.includes(placement);
}

export function isMainPost(post: BlogPost): boolean {
  return isPublished(post) && hasPlacement(post, "main");
}

export function isNoticePost(post: BlogPost): boolean {
  return isPublished(post) && hasPlacement(post, "notice");
}

export function sortPostsByDate(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
