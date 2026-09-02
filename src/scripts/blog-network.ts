import ForceGraph, {
  type GraphData,
  type LinkObject,
  type NodeObject,
} from "force-graph";
import { forceCollide } from "d3-force-3d";

export type BlogNetworkNode = NodeObject & {
  id: string;
  number: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  category: string;
  url: string;
  encrypted: boolean;
  degree: number;
  weightedDegree: number;
};

export type BlogNetworkLink = Omit<LinkObject<BlogNetworkNode>, "source" | "target"> & {
  source: string | BlogNetworkNode;
  target: string | BlogNetworkNode;
  type: "reference" | "shared-tags" | "related";
  label: string;
  weight: number;
  score: number;
  sharedTags: string[];
};

type LinkForce = {
  distance(value: (link: BlogNetworkLink) => number): LinkForce;
  strength(value: (link: BlogNetworkLink) => number): LinkForce;
  iterations(value: number): LinkForce;
};

type ChargeForce = {
  strength(value: (node: BlogNetworkNode) => number): ChargeForce;
  distanceMax(value: number): ChargeForce;
};

type BlogNetworkElements = {
  surface: HTMLElement;
  canvas: HTMLElement;
  preview: HTMLElement;
  previewTitle: HTMLElement;
  previewMeta: HTMLElement;
  previewDescription: HTMLElement;
  previewTags: HTMLElement;
};

type BlogNetworkOptions = BlogNetworkElements & {
  nodes: BlogNetworkNode[];
  links: BlogNetworkLink[];
};

export type BlogNetworkController = {
  setVisibleKeys(keys: Set<string>): void;
  resize(): void;
  reset(): void;
  destroy(): void;
};

const getEndpointId = (endpoint: string | BlogNetworkNode) => typeof endpoint === "object" ? endpoint.id : endpoint;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const LOCK_MARK = "\u{1F512}";

export function createBlogNetwork({
  surface,
  canvas,
  preview,
  previewTitle,
  previewMeta,
  previewDescription,
  previewTags,
  nodes,
  links,
}: BlogNetworkOptions): BlogNetworkController {
  const archiveRoot = surface.closest("[data-blog-archive]") ?? surface;
  const palette = {
    panel: "#fffdf8",
    ink: "#202326",
    accent: "#2973b2",
    signal: "#f4ce14",
  };
  const refreshPalette = () => {
    const styles = getComputedStyle(archiveRoot);
    palette.panel = styles.getPropertyValue("--color-paper-raised").trim() || "#fffdf8";
    palette.ink = styles.getPropertyValue("--color-ink").trim() || "#202326";
    palette.accent = styles.getPropertyValue("--color-blue").trim() || "#2973b2";
    palette.signal = styles.getPropertyValue("--color-signal").trim() || "#f4ce14";
  };
  refreshPalette();
  const themeObserver = new MutationObserver(refreshPalette);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const allLinks = links;
  let activeNodes = nodes;
  let activeLinks = links;
  let activeNode: BlogNetworkNode | null = null;
  let adjacency = new Map<string, Set<string>>();
  let lastVisibleSignature = "";
  let shouldFitOnStop = true;

  const rebuildAdjacency = () => {
    adjacency = new Map(activeNodes.map((node) => [node.id, new Set<string>()]));
    for (const link of activeLinks) {
      const source = getEndpointId(link.source);
      const target = getEndpointId(link.target);
      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);
    }
  };

  rebuildAdjacency();

  const isConnectedToActive = (node: BlogNetworkNode) => {
    if (!activeNode) return true;
    return node.id === activeNode.id || adjacency.get(activeNode.id)?.has(node.id) === true;
  };

  const isActiveLink = (link: BlogNetworkLink) => {
    if (!activeNode) return false;
    const source = getEndpointId(link.source);
    const target = getEndpointId(link.target);
    return source === activeNode.id || target === activeNode.id;
  };

  const nodeRadius = (node: BlogNetworkNode) => 10 + Math.min(4, Math.sqrt(Math.max(0, node.weightedDegree)) * 1.35);

  const drawNode = (node: BlogNetworkNode, context: CanvasRenderingContext2D) => {
    const radius = nodeRadius(node);
    const connected = isConnectedToActive(node);
    const highlighted = activeNode?.id === node.id;

    context.save();
    context.globalAlpha = connected ? 1 : 0.2;

    if (highlighted) {
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radius + 4.5, 0, Math.PI * 2);
      context.fillStyle = "rgba(244, 206, 20, 0.24)";
      context.fill();
    }

    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
    context.fillStyle = palette.panel;
    context.fill();
    context.lineWidth = highlighted ? 2 : 1.25;
    context.strokeStyle = highlighted ? palette.accent : "rgba(41, 115, 178, 0.48)";
    context.stroke();

    context.beginPath();
    context.arc((node.x ?? 0) + (radius * 0.58), (node.y ?? 0) - (radius * 0.58), 2.2, 0, Math.PI * 2);
    context.fillStyle = palette.signal;
    context.fill();

    const token = node.encrypted ? LOCK_MARK : node.number;
    if (token) {
      context.fillStyle = palette.ink;
      context.font = node.encrypted
        ? "9px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
        : "800 6.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(token, node.x ?? 0, (node.y ?? 0) + 0.35);
    }
    context.restore();
  };

  const drawPointerArea = (node: BlogNetworkNode, color: string, context: CanvasRenderingContext2D) => {
    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 4, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };

  const graph = new ForceGraph<BlogNetworkNode, BlogNetworkLink>(canvas)
    .nodeId("id")
    .backgroundColor("rgba(0, 0, 0, 0)")
    .nodeLabel(() => "")
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint(drawPointerArea)
    .linkLabel((link) => link.label)
    .linkColor((link) => {
      if (activeNode && !isActiveLink(link)) return "rgba(72, 166, 167, 0.06)";
      if (isActiveLink(link)) return "rgba(244, 206, 20, 0.92)";
      if (link.type === "reference") return "rgba(41, 115, 178, 0.78)";
      return `rgba(72, 166, 167, ${clamp(0.14 + (link.score * 0.48), 0.18, 0.58)})`;
    })
    .linkWidth((link) => {
      if (isActiveLink(link)) return 2.4;
      if (link.type === "reference") return 1.8;
      return clamp(0.55 + (link.weight * 0.48), 0.7, 1.5);
    })
    .linkLineDash((link) => link.type === "reference" ? null : [])
    .autoPauseRedraw(false)
    .enableNodeDrag(true)
    .enablePanInteraction(true)
    .enableZoomInteraction(true)
    .minZoom(0.45)
    .maxZoom(4)
    .d3VelocityDecay(0.38)
    .d3AlphaDecay(0.026)
    .warmupTicks(90)
    .cooldownTime(7_000)
    .onNodeClick((node, event) => {
      if (event.ctrlKey || event.metaKey) {
        window.open(node.url, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.assign(node.url);
    })
    .onNodeHover((node) => {
      activeNode = node;
      if (node) showPreview(node);
      else hidePreview();
    })
    .onNodeDrag((node) => {
      shouldFitOnStop = false;
      activeNode = node;
      showPreview(node);
    })
    .onNodeDragEnd((node) => {
      // The node is fixed only while held. Release it at the drop point with no
      // residual throw so the surrounding forces can find a nearby equilibrium.
      node.fx = undefined;
      node.fy = undefined;
      node.vx = 0;
      node.vy = 0;
    })
    .onZoom(() => {
      if (activeNode) updatePreviewPosition(activeNode);
    })
    .onEngineTick(() => {
      if (activeNode) updatePreviewPosition(activeNode);
    })
    .onEngineStop(() => {
      if (!shouldFitOnStop || activeNodes.length === 0) return;
      shouldFitOnStop = false;
      graph.zoomToFit(420, 48);
    });

  const linkForce = graph.d3Force("link") as unknown as LinkForce;
  linkForce
    .distance((link) => link.type === "reference"
      ? 62
      : clamp(138 - (link.weight * 42), 58, 126))
    .strength((link) => link.type === "reference"
      ? 0.78
      : clamp(0.055 + (link.score * 0.46), 0.08, 0.48))
    .iterations(2);

  const chargeForce = graph.d3Force("charge") as unknown as ChargeForce;
  chargeForce
    .strength((node) => -105 - Math.min(90, node.degree * 6))
    .distanceMax(520);

  graph.d3Force("collide", forceCollide((node) => nodeRadius(node as BlogNetworkNode) + 7).strength(0.92).iterations(2));

  function updatePreviewPosition(node: BlogNetworkNode) {
    if (node.x === undefined || node.y === undefined || preview.hidden) return;
    const { x, y } = graph.graph2ScreenCoords(node.x, node.y);
    const previewWidth = Math.min(240, Math.max(180, surface.clientWidth - 28));
    const useLeftSide = x + previewWidth + 38 > surface.clientWidth;
    preview.dataset.side = useLeftSide ? "left" : "right";
    preview.style.left = `${clamp(x, 14, Math.max(14, surface.clientWidth - 14))}px`;
    preview.style.top = `${clamp(y, 28, Math.max(28, surface.clientHeight - 28))}px`;
  }

  function showPreview(node: BlogNetworkNode) {
    const relatedLinks = activeLinks.filter((link) => {
      const source = getEndpointId(link.source);
      const target = getEndpointId(link.target);
      return source === node.id || target === node.id;
    }).length;

    previewTitle.textContent = node.title;
    previewMeta.textContent = `${node.date} · ${relatedLinks} links`;
    previewDescription.textContent = node.description;
    previewTags.textContent = node.tags.length > 0 ? node.tags.map((tag) => `#${tag}`).join(" ") : "untagged";
    preview.hidden = false;
    updatePreviewPosition(node);
  }

  function hidePreview() {
    activeNode = null;
    preview.hidden = true;
  }

  const resize = () => {
    const width = surface.clientWidth;
    const height = surface.clientHeight;
    if (width <= 0 || height <= 0) return;
    graph.width(width).height(height);
    if (activeNode) updatePreviewPosition(activeNode);
  };

  const setVisibleKeys = (keys: Set<string>) => {
    const signature = Array.from(keys).sort().join("|");
    if (signature === lastVisibleSignature) return;
    lastVisibleSignature = signature;

    activeNodes = nodes.filter((node) => keys.has(node.id));
    const activeIds = new Set(activeNodes.map((node) => node.id));
    activeLinks = allLinks.filter((link) => activeIds.has(getEndpointId(link.source)) && activeIds.has(getEndpointId(link.target)));
    rebuildAdjacency();
    hidePreview();
    shouldFitOnStop = true;
    graph.graphData({ nodes: activeNodes, links: activeLinks } satisfies GraphData<BlogNetworkNode, BlogNetworkLink>);
    graph.d3ReheatSimulation();
  };

  const reset = () => {
    for (const node of nodes) {
      delete node.x;
      delete node.y;
      delete node.vx;
      delete node.vy;
      delete node.fx;
      delete node.fy;
    }
    hidePreview();
    shouldFitOnStop = true;
    graph.graphData({ nodes: activeNodes, links: activeLinks });
    graph.d3ReheatSimulation();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(surface);
  resize();

  // ForceGraph mutates the supplied nodes and links; keeping these instances
  // lets filters preserve the last natural position when a node reappears.
  setVisibleKeys(new Set(nodeById.keys()));

  return {
    setVisibleKeys,
    resize,
    reset,
    destroy() {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      graph._destructor();
    },
  };
}
