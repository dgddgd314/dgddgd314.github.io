import rss from "@astrojs/rss";
import { SITE_TITLE, SITE_DESCRIPTION } from "../config";
import { getCollection } from "astro:content";
import createSlug from "../lib/createSlug";
import { isMainPost, sortPostsByDate } from "../lib/blog-publication";

export async function GET(context) {
  const blog = sortPostsByDate(await getCollection("blog")).filter(isMainPost);
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: import.meta.env.SITE,
    items: blog.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.data.slug || createSlug(post.data.title, post.id)}/`,
    })),
  });
}
