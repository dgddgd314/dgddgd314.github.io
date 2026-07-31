import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blogMetaSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  badge: z.string().optional(),
  category: z.string().optional(),
  tags: z
    .array(z.string())
    .refine((items) => new Set(items).size === items.length, {
      message: "tags must be unique",
    })
    .optional(),
});

const blogSchema = z.object({
  version: z.literal(2),
  meta: blogMetaSchema,
  page: z.unknown().optional(),
  blocks: z.array(z.unknown()),
}).transform(({ meta, page, blocks }) => ({
  ...meta,
  page,
  blocks,
}));

export type BlogSchema = z.infer<typeof blogSchema>;

const blogCollection = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.json" }),
  schema: blogSchema,
});

export const collections = {
  blog: blogCollection,
};