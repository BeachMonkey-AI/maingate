import { readFile } from "node:fs/promises";
import type { OperationalDataset } from "../types.js";

export interface DatasetStore {
  get(): Promise<OperationalDataset>;
  setKeyBoxNotes(propertyId: number, notes: string): Promise<void>;
}

/**
 * Loads the dataset once and holds it in memory. Writes mutate that copy and
 * nothing else — they are deliberately ephemeral, lost on redeploy, restart,
 * or scale-out. That's the accepted PoC trade: it demonstrates the write
 * conversation without standing up durable storage. Anything beyond a demo
 * needs a real backing store (the PRD names Firestore or a GCS blob), because
 * a second Cloud Run instance would not see these edits at all.
 */
export function createDatasetStore(filePath: string): DatasetStore {
  let cached: OperationalDataset | null = null;

  const load = async (): Promise<OperationalDataset> => {
    if (!cached) {
      cached = JSON.parse(await readFile(filePath, "utf-8")) as OperationalDataset;
    }
    return cached;
  };

  return {
    get: load,
    async setKeyBoxNotes(propertyId, notes) {
      const dataset = await load();
      const property = dataset.properties.find((p) => p.propertyId === propertyId);
      if (!property) {
        throw new Error(`No property with id ${propertyId}`);
      }
      property.keyBoxNotes = notes;
    },
  };
}
