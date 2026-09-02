export type NetworkPostInput = {
  key: string;
  tags: string[];
  references?: string[];
};

export type NetworkLink = {
  source: string;
  target: string;
  type: "reference" | "shared-tags" | "related";
  label: string;
  weight: number;
  score: number;
  sharedTags: string[];
};

export type ManualNetworkLink = {
  source: string;
  target: string;
  type?: string;
  label?: string;
  weight?: number;
  sharedTags?: string[];
  exclude?: boolean;
};

export type AutoNetworkOptions = {
  sharedTags?: boolean;
  minimumSharedTags?: number;
  weight?: number;
  internalReferences?: boolean;
  referenceWeight?: number;
};

const normalizeTag = (tag: string) => tag.trim().toLowerCase();
const normalizeEdgeKey = (source: string, target: string) => [source, target].sort().join("__");

const roundWeight = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Builds undirected links for the archive network.
 *
 * Shared tags are weighted by inverse document frequency, then compared with a
 * blend of weighted Jaccard and overlap similarity. A broad tag therefore
 * keeps a weak relationship without overpowering a smaller, more specific
 * cluster.
 */
export function buildPostNetwork(
  posts: NetworkPostInput[],
  manualLinks: ManualNetworkLink[] = [],
  autoOptions: AutoNetworkOptions = {},
): NetworkLink[] {
  const postKeys = new Set(posts.map((post) => post.key));
  const edgeMap = new Map<string, NetworkLink>();
  const normalizedTags = new Map(posts.map((post) => [
    post.key,
    Array.from(new Set(post.tags.map(normalizeTag).filter(Boolean))),
  ]));
  const tagFrequency = new Map<string, number>();

  for (const tags of normalizedTags.values()) {
    for (const tag of tags) tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
  }

  const tagRarity = (tag: string) => Math.log1p(posts.length / Math.max(1, tagFrequency.get(tag) ?? 1));
  const tagMass = (tags: string[]) => tags.reduce((total, tag) => total + tagRarity(tag), 0);

  const upsertEdge = (link: NetworkLink) => {
    if (!postKeys.has(link.source) || !postKeys.has(link.target) || link.source === link.target) return;

    const key = normalizeEdgeKey(link.source, link.target);
    const current = edgeMap.get(key);
    if (!current) {
      edgeMap.set(key, link);
      return;
    }

    const isReference = current.type === "reference" || link.type === "reference";
    current.type = isReference ? "reference" : current.type;
    current.label = isReference ? "reference" : current.label;
    current.weight = Math.max(current.weight, link.weight);
    current.score = Math.max(current.score, link.score);
    current.sharedTags = Array.from(new Set([...current.sharedTags, ...link.sharedTags]));
  };

  if (autoOptions.internalReferences !== false) {
    const referenceWeight = Math.max(0.1, autoOptions.referenceWeight ?? 2.2);
    for (const post of posts) {
      for (const target of new Set(post.references ?? [])) {
        upsertEdge({
          source: post.key,
          target,
          type: "reference",
          label: "reference",
          weight: referenceWeight,
          score: 1,
          sharedTags: [],
        });
      }
    }
  }

  if (autoOptions.sharedTags !== false) {
    const minimumSharedTags = Math.max(1, autoOptions.minimumSharedTags ?? 1);
    const baseWeight = Math.max(0.1, autoOptions.weight ?? 1);

    for (let sourceIndex = 0; sourceIndex < posts.length; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < posts.length; targetIndex += 1) {
        const source = posts[sourceIndex];
        const target = posts[targetIndex];
        const sourceTags = normalizedTags.get(source.key) ?? [];
        const targetTags = normalizedTags.get(target.key) ?? [];
        const targetTagSet = new Set(targetTags);
        const sharedTags = sourceTags.filter((tag) => targetTagSet.has(tag));
        if (sharedTags.length < minimumSharedTags) continue;

        const sharedMass = tagMass(sharedTags);
        const sourceMass = tagMass(sourceTags);
        const targetMass = tagMass(targetTags);
        const unionMass = Math.max(sharedMass, sourceMass + targetMass - sharedMass);
        const smallerMass = Math.max(sharedMass, Math.min(sourceMass, targetMass));
        const weightedJaccard = sharedMass / unionMass;
        const weightedOverlap = sharedMass / smallerMass;
        const score = (weightedJaccard * 0.65) + (weightedOverlap * 0.35);

        upsertEdge({
          source: source.key,
          target: target.key,
          type: "shared-tags",
          label: sharedTags.map((tag) => `#${tag}`).join(", "),
          weight: roundWeight(baseWeight * (0.35 + (score * 1.65))),
          score: roundWeight(score),
          sharedTags,
        });
      }
    }
  }

  // Explicit configuration is applied last so it can override or remove an
  // automatically discovered relationship.
  for (const link of manualLinks) {
    if (!postKeys.has(link.source) || !postKeys.has(link.target) || link.source === link.target) continue;
    const key = normalizeEdgeKey(link.source, link.target);
    if (link.exclude) {
      edgeMap.delete(key);
      continue;
    }

    const current = edgeMap.get(key);
    const explicitType = link.type === "reference"
      ? "reference"
      : link.type === "shared-tags"
        ? "shared-tags"
        : link.type
          ? "related"
          : undefined;
    const type = explicitType ?? current?.type ?? "related";
    const sharedTags = link.sharedTags
      ? link.sharedTags.map(normalizeTag).filter(Boolean)
      : current?.sharedTags ?? [];

    edgeMap.set(key, {
      source: link.source,
      target: link.target,
      type,
      label: link.label ?? (explicitType ? type : current?.label ?? type),
      weight: roundWeight(Math.max(0.1, link.weight ?? current?.weight ?? (type === "reference" ? 2 : 1))),
      score: current?.score ?? 1,
      sharedTags,
    });
  }

  return Array.from(edgeMap.values());
}
