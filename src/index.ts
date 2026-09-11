import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { JsonDataStore } from "./data/jsonDataStore.js";
import type { DataStore } from "./data/store.js";
import { createIntentParser } from "./intent/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createDataStore(): DataStore {
  if (process.env.DATA_STORE === "firestore") {
    // Loaded dynamically so the Firestore SDK/creds aren't required for the
    // default (JSON) path — see src/data/firestoreDataStore.ts for status.
    throw new Error(
      "DATA_STORE=firestore is not wired up yet in this PoC — see src/data/firestoreDataStore.ts.",
    );
  }
  const dataFile = process.env.DATA_FILE ?? path.join(__dirname, "..", "data", "sample-data.json");
  return new JsonDataStore(dataFile);
}

const port = Number(process.env.PORT ?? 8080);
const app = createApp(createDataStore(), createIntentParser());

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MainGate PoC listening on port ${port}`);
});
