/**
 * Hierarchical clustering with average linkage.
 * Returns a reordered list of indices that groups correlated instruments.
 *
 * FIX: The function was previously named wardDistance and described as
 * "Ward linkage", but actually implemented average linkage (arithmetic mean
 * of all pairwise distances). Renamed to averageLinkageDistance to match
 * the actual algorithm. Results are unchanged — average linkage is a
 * well-established method — only the naming has been corrected.
 */

type DistMatrix = number[][];

/** Average linkage distance between two clusters. */
function averageLinkageDistance(
  c1: number[],
  c2: number[],
  dist: DistMatrix
): number {
  let total = 0;
  for (const i of c1) for (const j of c2) total += dist[i][j];
  return total / (c1.length * c2.length);
}

/**
 * Convert a correlation matrix (values in [-1, 1]) into a distance matrix.
 * Distance = 1 - |r|  so highly correlated → close, uncorrelated → distant.
 */
export function correlationToDistance(matrix: number[][]): DistMatrix {
  return matrix.map((row, i) =>
    row.map((r, j) => i === j ? 0 : 1 - Math.abs(r))
  );
}

interface Cluster {
  members: number[];
}

/**
 * Agglomerative clustering with average linkage.
 * Returns a reordered list of original indices that puts correlated items adjacent.
 */
export function hierarchicalCluster(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n <= 1) return [0];

  const dist = correlationToDistance(matrix);
  const clusters: Cluster[] = Array.from({ length: n }, (_, i) => ({ members: [i] }));

  while (clusters.length > 1) {
    let minDist = Infinity;
    let mergeA = 0, mergeB = 1;

    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const d = averageLinkageDistance(clusters[a].members, clusters[b].members, dist);
        if (d < minDist) { minDist = d; mergeA = a; mergeB = b; }
      }
    }

    const merged: Cluster = {
      members: [...clusters[mergeA].members, ...clusters[mergeB].members],
    };

    clusters.splice(mergeB, 1);
    clusters.splice(mergeA, 1);
    clusters.push(merged);
  }

  return clusters[0]?.members ?? Array.from({ length: n }, (_, i) => i);
}

/**
 * Given a correlation matrix and the clustered order, compute cluster boundary
 * positions (for drawing visual separators in the heatmap).
 */
export function getClusterBoundaries(
  matrix: number[][],
  order: number[],
  threshold: number = 0.4
): number[] {
  const boundaries: number[] = [];
  const n = order.length;

  for (let i = 1; i < n; i++) {
    const prev = order[i - 1];
    const curr = order[i];
    const r = Math.abs(matrix[prev][curr]);
    if (r < threshold) boundaries.push(i);
  }

  return boundaries;
}
