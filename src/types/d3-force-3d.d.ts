declare module "d3-force-3d" {
  type ForceNode = {
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
  };

  type CollisionForce = {
    (alpha: number): void;
    initialize(nodes: ForceNode[], random?: () => number, dimensions?: number): void;
    iterations(value: number): CollisionForce;
    radius(value: number | ((node: ForceNode) => number)): CollisionForce;
    strength(value: number): CollisionForce;
  };

  export function forceCollide(radius?: number | ((node: ForceNode) => number)): CollisionForce;
}
