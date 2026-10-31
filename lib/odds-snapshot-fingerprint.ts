import { createHash } from "node:crypto";

export type SnapshotOutcome = {
  name: string;
  point?: number;
  price?: number;
};

export function oddsSnapshotFingerprint(
  outcomes: readonly SnapshotOutcome[],
  providerUpdatedAt: string | null,
) {
  const canonicalOutcomes = outcomes
    .map(({ name, point, price }) => ({
      name,
      point: point ?? null,
      price: price ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return createHash("sha256")
    .update(JSON.stringify({ outcomes: canonicalOutcomes, providerUpdatedAt }))
    .digest("hex");
}
