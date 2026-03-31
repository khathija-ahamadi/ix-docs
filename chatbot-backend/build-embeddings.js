#!/usr/bin/env node
/**
 * build-embeddings.js
 *
 * Generates dense vector embeddings for every doc chunk in docs.json
 * using an OpenAI-compatible embeddings API (Siemens LLM / Groq / OpenAI).
 *
 * The resulting embeddings.json is loaded by server.js at startup to power
 * true semantic similarity search (BM25 + dense embedding cosine).
 *
 * Usage:
 *   # Using environment variable
 *   export SIEMENS_LLM_API_KEY=<your-key>
 *   node build-embeddings.js
 *
 *   # Or pass API key directly via CLI
 *   node build-embeddings.js --key=<your-api-key>
 *
 *   # Specify provider
 *   node build-embeddings.js --provider=groq --key=<your-groq-key>
 *
 *   # Force full rebuild (ignore cache)
 *   node build-embeddings.js --force
 *
 * The script is idempotent: it skips chunks whose content hash hasn't changed
 * since the last run, only embedding new or modified chunks.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

// ─── Configuration ──────────────────────────────────────────────────

const DOCS_PATH = path.resolve(__dirname, "docs.json");
const EMBEDDINGS_PATH = path.resolve(__dirname, "embeddings.json");
const BATCH_SIZE = 20;          // docs per API call
const BATCH_DELAY_MS = 200;     // pause between batches to respect rate limits
const MAX_INPUT_CHARS = 8000;   // max chars per input text (conservative)

// Optional TLS bypass for corporate proxy compatibility
const ALLOW_INSECURE_SSL =
  String(process.env.ALLOW_INSECURE_SSL || "false").toLowerCase() === "true";
if (ALLOW_INSECURE_SSL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ─── Provider config ────────────────────────────────────────────────

const PROVIDERS = {
  siemens: {
    url: "https://api.siemens.com/llm/v1/embeddings",
    model: process.env.EMBEDDING_MODEL || "bge-m3",
    apiKey: () => process.env.SIEMENS_LLM_API_KEY || process.env.LLM_API_KEY || "",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/embeddings",
    model: process.env.EMBEDDING_MODEL || "nomic-embed-text-v1.5",
    apiKey: () => process.env.GROQ_API_KEY || "",
  },
  openai: {
    url: "https://api.openai.com/v1/embeddings",
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    apiKey: () => process.env.OPENAI_API_KEY || "",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function contentHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Prepare the text fed to the embedding model: title + keywords + content. */
function prepareEmbeddingInput(doc) {
  const parts = [doc.title || ""];
  if (doc.keywords?.length) parts.push(doc.keywords.slice(0, 15).join(", "));
  parts.push((doc.content || "").slice(0, MAX_INPUT_CHARS));
  return parts.join("\n\n").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Embedding API call ─────────────────────────────────────────────

async function fetchEmbeddings(texts, providerConfig, apiKey) {
  const response = await axios.post(
    providerConfig.url,
    {
      model: providerConfig.model,
      input: texts,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
    }
  );

  // OpenAI-compatible response: { data: [{ embedding: [...], index: 0 }, ...] }
  const data = response.data?.data;
  if (!Array.isArray(data)) {
    throw new Error(
      `Unexpected embedding response shape: ${JSON.stringify(response.data).slice(0, 200)}`
    );
  }

  // Sort by index to ensure order matches input
  return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const providerArg =
    args.find((a) => a.startsWith("--provider="))?.split("=")[1] || "siemens";
  const forceArg = args.includes("--force");
  const cliKey = args.find((a) => a.startsWith("--key="))?.split("=").slice(1).join("=") || "";

  const providerConfig = PROVIDERS[providerArg];
  if (!providerConfig) {
    console.error(
      `Unknown provider: ${providerArg}. Choose: ${Object.keys(PROVIDERS).join(", ")}`
    );
    process.exit(1);
  }

  const apiKey = cliKey || providerConfig.apiKey();
  if (!apiKey) {
    console.error(
      `No API key found for provider "${providerArg}". Set the appropriate env var.`
    );
    process.exit(1);
  }

  // Load docs
  if (!fs.existsSync(DOCS_PATH)) {
    console.error("docs.json not found. Run 'node build-docs.js' first.");
    process.exit(1);
  }
  const docs = JSON.parse(fs.readFileSync(DOCS_PATH, "utf-8"));
  console.log(`📄 Loaded ${docs.length} doc chunks from docs.json`);

  // Load existing embeddings (for incremental updates)
  let existing = { provider: null, model: null, dimensions: null, vectors: [] };
  if (fs.existsSync(EMBEDDINGS_PATH) && !forceArg) {
    try {
      existing = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf-8"));
      console.log(`📦 Loaded ${existing.vectors.length} existing embeddings`);
    } catch {
      console.warn(
        "⚠️  Could not parse existing embeddings.json — rebuilding from scratch"
      );
    }
  }

  // Build hash map of existing embeddings for fast lookups
  const existingMap = new Map();
  if (
    existing.provider === providerArg &&
    existing.model === providerConfig.model
  ) {
    for (const v of existing.vectors) {
      existingMap.set(v.hash, v.embedding);
    }
  } else if (existing.vectors.length > 0) {
    console.log(
      `🔄 Provider/model changed (${existing.provider}/${existing.model} → ${providerArg}/${providerConfig.model}). Rebuilding all.`
    );
  }

  // Prepare inputs and determine which need embedding
  const prepared = docs.map((doc, i) => {
    const text = prepareEmbeddingInput(doc);
    const hash = contentHash(text);
    return { index: i, text, hash, cached: existingMap.get(hash) || null };
  });

  const toEmbed = prepared.filter((p) => !p.cached);
  console.log(
    `\n🔢 ${prepared.length} chunks total, ${prepared.length - toEmbed.length} cached, ${toEmbed.length} to embed`
  );

  if (toEmbed.length === 0) {
    console.log("✅ All embeddings are up to date — nothing to do.");
    // Still rewrite to ensure vector ordering matches current docs.json
    writeOutput(prepared, providerArg, providerConfig.model);
    return;
  }

  // Batch embedding
  let completed = 0;
  let dimensions = existing.dimensions;

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    try {
      const embeddings = await fetchEmbeddings(texts, providerConfig, apiKey);
      for (let j = 0; j < batch.length; j++) {
        batch[j].cached = embeddings[j];
        if (!dimensions && embeddings[j]) dimensions = embeddings[j].length;
      }
      completed += batch.length;
      const pct = ((completed / toEmbed.length) * 100).toFixed(0);
      process.stdout.write(
        `\r  ⏳ Embedded ${completed}/${toEmbed.length} chunks (${pct}%)`
      );
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.error(`\n❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${msg}`);
      console.error("   Saving partial progress and exiting...");
      break;
    }

    if (i + BATCH_SIZE < toEmbed.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(""); // newline after progress
  writeOutput(prepared, providerArg, providerConfig.model, dimensions);
}

function writeOutput(prepared, provider, model, dimensions) {
  const vectors = prepared.map((p) => ({
    hash: p.hash,
    embedding: p.cached || null,
  }));

  const validCount = vectors.filter((v) => v.embedding).length;
  const dims =
    dimensions || (vectors.find((v) => v.embedding)?.embedding?.length ?? null);

  const output = {
    provider,
    model,
    dimensions: dims,
    generatedAt: new Date().toISOString(),
    totalChunks: vectors.length,
    embeddedChunks: validCount,
    vectors,
  };

  fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify(output), "utf-8");
  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(0);
  console.log(
    `\n✅ Wrote ${validCount}/${vectors.length} embeddings to embeddings.json (~${sizeKB} KB)`
  );
  console.log(
    `   Provider: ${provider}, Model: ${model}, Dimensions: ${dims || "unknown"}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
