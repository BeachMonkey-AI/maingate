import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createDatasetStore } from "./data/dataset.js";
import { GeminiAnswerer } from "./gemini/answerer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is required — see .env.example.");
}

const dataFile = process.env.DATA_FILE ?? path.join(__dirname, "..", "data", "sample-data.json");
const models = process.env.GEMINI_MODELS?.split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const app = createApp(createDatasetStore(dataFile), new GeminiAnswerer(apiKey, models));

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MainGate PoC listening on port ${port}`);
});
