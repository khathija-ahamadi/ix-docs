require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const docs = require("./docs.json");

// Optional TLS bypass for corporate proxy compatibility (off by default)
const ALLOW_INSECURE_SSL = String(process.env.ALLOW_INSECURE_SSL || "false").toLowerCase() === "true";
if (ALLOW_INSECURE_SSL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ─── Usage Analytics ────────────────────────────────────────────────
/**
 * In-memory analytics store. Tracks queries across all endpoints.
 * Exposes a GET /analytics endpoint for documentation-improvement dashboards.
 */
const analytics = {
  queryCounts: new Map(),           // normalized query text -> count
  recentQueries: [],                // up to 500 most-recent entries
  endpointCounts: { chat: 0, generate: 0, migrate: 0, refine: 0 },
};

function trackAnalytics(text, endpoint = "chat", lang = "en") {
  if (!text) return;
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  analytics.queryCounts.set(normalized, (analytics.queryCounts.get(normalized) || 0) + 1);
  analytics.recentQueries.unshift({
    text: text.slice(0, 200),
    timestamp: Date.now(),
    endpoint,
    lang,
  });
  if (analytics.recentQueries.length > 500) analytics.recentQueries.pop();
  analytics.endpointCounts[endpoint] = (analytics.endpointCounts[endpoint] || 0) + 1;
}

// ─── Multi-language Support ──────────────────────────────────────────
/**
 * Maps ISO-639-1 language codes to a short instruction appended to the
 * system prompt so the LLM responds in the user's preferred language.
 */
const LANG_INSTRUCTIONS = {
  de: "Antworte auf Deutsch. Behalte alle Code-Beispiele in der Originalsprache.",
  zh: "请用简体中文回答。保留所有代码示例为原始语言。",
  fr: "Réponds en français. Conserve tous les exemples de code dans la langue d'origine.",
  es: "Responde en español. Mantén todos los ejemplos de código en el idioma original.",
  ja: "日本語で回答してください。コード例は元の言語のまま維持してください。",
  pt: "Responda em português. Mantenha todos os exemplos de código no idioma original.",
  ko: "한국어로 답변해 주세요. 코드 예시는 원래 언어로 유지하세요.",
  // English is the default — no instruction needed
};

function langInstruction(lang) {
  return lang && LANG_INSTRUCTIONS[lang] ? ` ${LANG_INSTRUCTIONS[lang]}` : "";
}

// ─── Express setup ──────────────────────────────────────────────────
const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser requests (curl, health checks) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "200kb" }));

// ─── Rate limiter (in-memory, per IP) ──────────────────────────────
const RATE_WINDOW_MS = 60_000;   // 1 minute window
const RATE_LIMIT_MAX = 30;       // 30 requests per window
const _rateMap = new Map();

function rateLimiter(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  let entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count += 1;
  _rateMap.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX) {
    return res
      .status(429)
      .json({ error: "Rate limit exceeded. Please wait a moment before trying again." });
  }
  next();
}
// Prune stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of _rateMap.entries()) {
    if (now > e.resetAt + RATE_WINDOW_MS) _rateMap.delete(ip);
  }
}, 5 * 60_000);

// ─── Query expansion (synonyms / aliases) ───────────────────────────
// Maps common natural-language terms to iX component or concept names.
// When the user says "popup", we also search for "modal", etc.
const QUERY_ALIASES = {
  popup: ["modal", "dialog"],
  dialog: ["modal"],
  sidebar: ["menu", "application-menu", "ix-menu"],
  navbar: ["application-header", "ix-application-header", "header"],
  header: ["application-header"],
  nav: ["menu", "breadcrumb", "tabs"],
  table: ["html-grid", "grid", "ag-grid", "data-grid"],
  datagrid: ["grid", "ag-grid", "html-grid"],
  form: ["forms-field", "forms-layout", "forms-validation", "input", "checkbox", "select", "radio"],
  login: ["input", "button", "checkbox", "forms-field"],
  notification: ["toast", "messagebar", "message-bar"],
  alert: ["messagebar", "message-bar", "toast"],
  accordion: ["blind", "ix-blind"],
  collapse: ["blind", "ix-blind"],
  collapsible: ["blind", "ix-blind"],
  tag: ["chip", "pill"],
  badge: ["pill", "chip"],
  switch: ["toggle", "ix-toggle"],
  toggle: ["ix-toggle"],
  progress: ["progress-indicator", "spinner"],
  loading: ["spinner", "progress-indicator"],
  calendar: ["date-picker", "date-input", "date-dropdown"],
  datepicker: ["date-picker", "date-input", "date-dropdown"],
  timepicker: ["time-picker", "time-input"],
  color: ["colors", "theming", "theme"],
  theme: ["theming", "colors"],
  dark: ["theming", "theme"],
  light: ["theming", "theme"],
  install: ["installation", "setup", "getting-started"],
  setup: ["installation", "getting-started"],
  start: ["getting-started", "installation", "starter-app"],
  migrate: ["migration"],
  upgrade: ["migration"],
  version: ["migration", "release", "changelog"],
  chart: ["line-chart", "bar-chart", "pie-chart", "gauge-chart"],
  graph: ["line-chart", "bar-chart", "chart"],
  search: ["expanding-search", "category-filter"],
  overlay: ["modal", "drawer", "pane"],
  drawer: ["pane", "panes"],
  panel: ["pane", "panes", "blind"],
  cards: ["card", "card-list"],
  list: ["event-list", "card-list", "key-value-list"],
  dropdown: ["select", "dropdown-button", "ix-dropdown"],
  icon: ["icons", "icon-button", "ix-icons"],
  typography: ["fonts", "text", "styles"],
  spacing: ["layout-grid", "layout-auto"],
  layout: ["layout-grid", "layout-auto", "panes", "application"],
  responsive: ["breakpoints", "application", "layout-grid"],
  accessibility: ["a11y", "accessible"],
  a11y: ["accessibility"],
};

/**
 * Expand a user query with synonyms / aliases.
 * Returns the original query + appended synonym terms.
 */
function expandQuery(query) {
  const lower = query.toLowerCase();
  const extras = new Set();
  for (const [trigger, synonyms] of Object.entries(QUERY_ALIASES)) {
    if (lower.includes(trigger)) {
      for (const syn of synonyms) extras.add(syn);
    }
  }
  if (extras.size === 0) return query;
  return `${query} ${[...extras].join(" ")}`;
}

// ─── BM25 Search Engine ────────────────────────────────────────────

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","need","to","of","in","for","on","with","at","by","from",
  "as","into","through","during","before","after","above","below","between",
  "out","off","over","under","again","further","then","once","here","there",
  "when","where","why","how","all","each","every","both","few","more","most",
  "other","some","such","no","nor","not","only","own","same","so","than",
  "too","very","and","but","or","if","while","because","until","that",
  "which","who","whom","this","these","those","it","its","they","them",
  "their","what","we","you","your","i","me","my","he","she","his","her",
  "up","about","just","also","now","like",
]);

/** Tokenise text into lowercase terms, filtering stopwords. */
function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]{1,}/g) || [])
    .filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

/**
 * Build a BM25 inverted index AND unit-normalised TF-IDF vectors for
 * every document. The vectors power the cosine-similarity semantic layer
 * that is blended with BM25 to produce hybrid search scores.
 *
 * Called once at server startup.
 */
function buildSearchIndex(corpus) {
  const N = corpus.length;
  const docTermFreqs = [];
  const docLengths = [];
  const df = {};

  for (const doc of corpus) {
    // Index title (triple-weighted), keywords (double-weighted), and content
    const titleTokens = tokenize(doc.title);
    const keywordTokens = (doc.keywords || []).flatMap((k) => tokenize(k));
    const contentTokens = tokenize(doc.content);
    const tokens = [
      ...titleTokens, ...titleTokens, ...titleTokens,
      ...keywordTokens, ...keywordTokens,
      ...contentTokens,
    ];

    const tf = {};
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }
    docTermFreqs.push(tf);
    docLengths.push(tokens.length);

    for (const t of Object.keys(tf)) {
      df[t] = (df[t] || 0) + 1;
    }
  }

  // IDF with BM25 formula
  const idf = {};
  for (const [term, freq] of Object.entries(df)) {
    idf[term] = Math.log((N - freq + 0.5) / (freq + 0.5) + 1);
  }

  const avgDl = docLengths.reduce((s, l) => s + l, 0) / N;

  // ── Semantic Search: build unit-normalised TF-IDF doc vectors ────────
  // Each vector maps term -> (tf/dl) * idf, then L2-normalised to unit length.
  // Cosine similarity against a query vector gives a language-independent
  // relevance signal that improves recall for paraphrased / synonym queries.
  const docVectors = docTermFreqs.map((tf, i) => {
    const dl = docLengths[i] || 1;
    const vec = {};
    let norm = 0;
    for (const [term, freq] of Object.entries(tf)) {
      const val = (freq / dl) * (idf[term] || 0);
      vec[term] = val;
      norm += val * val;
    }
    norm = Math.sqrt(norm) || 1;
    for (const term in vec) vec[term] /= norm;
    return vec;
  });

  return { docTermFreqs, docLengths, idf, avgDl, docVectors };
}

/**
 * Compute cosine similarity between a query and a pre-normalised doc vector.
 * The doc vector is already L2-normalised; we only need to normalise the query.
 */
function cosineSimilarity(queryTokens, idf, docVector) {
  const uniqueTerms = [...new Set(queryTokens)];
  let dot = 0;
  let queryNormSq = 0;
  for (const term of uniqueTerms) {
    const idfVal = idf[term] || 0;
    if (idfVal === 0) continue;
    const qVal = idfVal; // TF=1 (presence) * IDF
    const dVal = docVector[term] || 0;
    dot += qVal * dVal;
    queryNormSq += qVal * qVal;
  }
  if (queryNormSq === 0) return 0;
  return dot / Math.sqrt(queryNormSq);
}

/**
 * Hybrid search: BM25 (lexical) + cosine TF-IDF (semantic) blended scores.
 *
 * Blending weight alpha:
 *   final = alpha * BM25_normalised + (1-alpha) * cosine_similarity
 *
 * Cosine similarity catches paraphrased / synonym queries that BM25 misses
 * because it works in a continuous vector space rather than exact term overlap.
 *
 * Returns top-K docs sorted by hybrid relevance score.
 */
const HYBRID_ALPHA = 0.60; // 60% BM25, 40% cosine semantic

function searchDocs(query, topK = 10) {
  const expanded = expandQuery(query);
  const queryTokens = tokenize(expanded);
  if (queryTokens.length === 0) return [];

  const { docTermFreqs, docLengths, idf, avgDl, docVectors } = searchIndex;
  const k1 = 1.5;
  const b = 0.75;
  const lowerQuery = query.toLowerCase();

  // ── Pass 1: BM25 scores ───────────────────────────────────────────
  const rawScores = docs.map((doc, i) => {
    let bm25 = 0;
    const tf = docTermFreqs[i];
    const dl = docLengths[i];

    for (const qt of queryTokens) {
      const termFreq = tf[qt] || 0;
      if (termFreq === 0) continue;
      const idfVal = idf[qt] || 0;
      const tfNorm =
        (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + (b * dl) / avgDl));
      bm25 += idfVal * tfNorm;
    }

    // Title-match boosts (applied on BM25 only)
    const lowerTitle = doc.title.toLowerCase();
    if (lowerTitle.includes(lowerQuery)) bm25 *= 2.0;
    else {
      const originalTokens = tokenize(query);
      const titleHits = originalTokens.filter((t) => lowerTitle.includes(t)).length;
      if (titleHits > 0) bm25 *= 1 + 0.3 * (titleHits / Math.max(originalTokens.length, 1));
    }

    const matchedKeywords = queryTokens.filter((t) => (tf[t] || 0) > 0);
    return { docIdx: i, doc, bm25, matchedKeywords };
  });

  // ── Pass 2: cosine semantic scores ───────────────────────────────
  // Normalise BM25 to [0,1] then blend with cosine
  const maxBM25 = Math.max(...rawScores.map((s) => s.bm25), 1e-9);

  const scores = rawScores.map(({ docIdx, doc, bm25, matchedKeywords }) => {
    const bm25Norm = bm25 / maxBM25;
    const cosine = cosineSimilarity(queryTokens, idf, docVectors[docIdx]);
    const hybridScore = HYBRID_ALPHA * bm25Norm + (1 - HYBRID_ALPHA) * cosine;
    return {
      title: doc.title,
      content: doc.content,
      score: hybridScore,
      source: doc.source,
      url: doc.url || null,
      matchedKeywords,
    };
  });

  const ranked = scores
    .filter((d) => d.score > 0.001)
    .sort((a, b) => b.score - a.score);

  // Apply section-type boost and annotate deprecation signals
  for (const r of ranked) {
    const doc = docs.find((d) => d.source === r.source);
    if (doc) {
      r.score *= sectionTypeBoost(doc, queryTokens);
      r.deprecated = hasDeprecationSignal(r.content);
    }
  }

  // Re-sort after boosting and deduplicate by URL
  ranked.sort((a, b) => b.score - a.score);
  return uniqueByUrl(ranked, topK);
}

// ─── Deprecation-signal detection ─────────────────────────────────────────
const DEPRECATION_SIGNALS = [
  "deprecated", "deprecation", "removed in", "use instead", "migrate to",
  "no longer supported", "will be removed", "breaking change", "replacement",
  "was removed", "has been removed",
];

function hasDeprecationSignal(text = "") {
  const lower = text.toLowerCase();
  return DEPRECATION_SIGNALS.some((s) => lower.includes(s));
}

// ─── Section-type boost for migration / deprecation queries ──────────────
const MIGRATION_TERMS = new Set([
  "migration", "migrate", "upgrade", "breaking", "deprecated",
  "changelog", "release", "deprecation", "removed", "replacement",
]);

function sectionTypeBoost(doc, queryTokens) {
  const lowerTitle = (doc.title || "").toLowerCase();
  const lowerSource = (doc.source || "").toLowerCase();
  const isMigrationDoc =
    MIGRATION_TERMS.has(lowerSource.split("/")[0]) ||
    [...MIGRATION_TERMS].some((t) => lowerTitle.includes(t)) ||
    lowerSource.includes("blog/") ||
    hasDeprecationSignal(doc.content);
  const queryIsMigration = queryTokens.some((qt) => MIGRATION_TERMS.has(qt));
  return isMigrationDoc && queryIsMigration ? 1.6 : 1.0;
}

// ─── URL-level deduplication ───────────────────────────────────────────
function uniqueByUrl(results, max = 10) {
  const out = [];
  const seen = new Set();
  for (const r of results) {
    const url = r?.url || "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

function buildFreeTierAnswer(question, docsForAnswer = []) {
  if (!Array.isArray(docsForAnswer) || docsForAnswer.length === 0) {
    return (
      "I couldn't find relevant information in the iX documentation for that question. " +
      "Try rephrasing or ask about a specific component, installation, theming, or guidelines."
    );
  }

  const preview = docsForAnswer
    .slice(0, 3)
    .map((d, idx) => {
      const raw = (d.content || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/#+\s+/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const snippet = raw.slice(0, 260);
      return `- [${idx + 1}] **${d.title}**: ${snippet}${raw.length > 260 ? "…" : ""}`;
    })
    .join("\n");

  return [
    "Free-tier documentation answer (no AI key configured):",
    "",
    `Question: ${question.trim()}`,
    "",
    "Relevant iX docs:",
    preview,
    "",
    "Add an API key in Settings to enable full AI chat responses and deeper synthesis.",
  ].join("\n");
}

// Build hybrid search index at startup
const searchIndex = buildSearchIndex(docs);
console.log(`Hybrid search index (BM25 + cosine TF-IDF) built over ${docs.length} document chunks`);

// ─── LLM helpers ────────────────────────────────────────────────────

// Default models per provider
const PROVIDER_DEFAULTS = {
  siemens: {
    chat: "glm-5",
    codegen: "devstral-small-2505",
  },
  groq: {
    chat: "llama-3.3-70b-versatile",
    codegen: "llama-3.3-70b-versatile",
  },
};

const PROVIDER_MODELS = {
  siemens: new Set([
    "glm-5",
    "qwen3-30b-a3b-instruct-2507",
    "qwen3-30b-a3b-thinking-2507",
    "deepseek-r1-0528-qwen3-8b",
    "devstral-small-2505",
    "mistral-7b-instruct",
  ]),
  groq: new Set([
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ]),
};

function resolveProvider(provider) {
  return provider === "groq" ? "groq" : "siemens";
}

function resolveModel(provider, model, task = "chat") {
  const resolvedProvider = resolveProvider(provider);
  const defaultsByTask = PROVIDER_DEFAULTS[resolvedProvider] || PROVIDER_DEFAULTS.siemens;
  const fallback = task === "codegen" ? defaultsByTask.codegen : defaultsByTask.chat;
  if (!model || typeof model !== "string") return fallback;
  return PROVIDER_MODELS[resolvedProvider]?.has(model) ? model : fallback;
}

/**
 * Unified LLM call helper supporting Siemens and Groq.
 * Groq uses the same OpenAI-compatible interface but a different base URL
 * and does NOT require the TLS bypass agent used for the Siemens corporate proxy.
 */
async function callLLM({ messages, apiKey, provider = "siemens", model, task = "chat", temperature = 0.3, maxTokens = 2048 }) {
  const resolvedProvider = resolveProvider(provider);
  const resolvedModel = resolveModel(resolvedProvider, model, task);

  if (resolvedProvider === "groq") {
    // Groq — public API, no custom httpsAgent
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: resolvedModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message.content;
  } else {
    // Siemens LLM API (corporate proxy — global TLS bypass already set)
    const response = await axios.post(
      "https://api.siemens.com/llm/v1/chat/completions",
      {
        model: resolvedModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message.content;
  }
}

async function askAI(context, question, userApiKey, lang = "en", provider = "siemens", model = null) {
  const key = userApiKey || process.env.LLM_API_KEY;
  if (!key) throw new Error('No API key available. Please add your AI API key in the ⚙️ Settings tab.');

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful assistant for the Siemens Industrial Experience (iX) design system. " +
        "Answer only from the provided documentation. " +
        "If any component, property, or API in the question has been deprecated or removed, " +
        "always highlight this clearly with a ⚠️ warning, state which version introduced the change, " +
        `and provide the recommended replacement or migration path.${langInstruction(lang)}`,
    },
    {
      role: "user",
      content: `Documentation: ${context}\n\nQuestion: ${question}`,
    },
  ];

  return callLLM({ messages, apiKey: key, provider, model, task: "chat", temperature: 0.3, maxTokens: 2048 });
}

/**
 * Code-generation-specific LLM call.
 * Receives multiple component docs + the user description + target framework.
 */
async function generateCode(componentDocs, description, framework, userApiKey, fileContent, fileName, provider = "siemens", model = null) {
  const key = userApiKey || process.env.LLM_API_KEY;
  if (!key) throw new Error('No API key available. Please add your AI API key in the ⚙️ Settings tab.');
  const frameworkGuide = {
    react: `Use React with @siemens/ix-react. Import components like: import { IxButton, IxInput } from '@siemens/ix-react'; Use JSX with PascalCase tags (e.g. <IxButton>, <IxInput>). For boolean props use prop={true}. For events use onEventName.`,
    angular: `Use Angular with @siemens/ix-angular. For standalone components: import { IxButton } from '@siemens/ix-angular/standalone'; For module setup: import { IxModule } from '@siemens/ix-angular'. Use kebab-case tags in templates (e.g. <ix-button>, <ix-input>). Bind props with [prop]="value". Bind events with (eventName)="handler($event)".`,
    "angular-standalone": `Use Angular standalone components with @siemens/ix-angular. Import each component individually: import { IxButton, IxInput } from '@siemens/ix-angular/standalone'; Add them to the component's imports array: @Component({ standalone: true, imports: [IxButton, IxInput, CommonModule] }). Use kebab-case tags in templates. Bind props with [prop]="value". Bind events with (eventName)="handler($event)".`,
    vue: `Use Vue 3 with @siemens/ix-vue. Import components like: import { IxButton, IxInput } from '@siemens/ix-vue'; Use PascalCase tags in templates. Bind props with :prop="value". Bind events with @eventName="handler".`,
    webcomponents: `Use Web Components (vanilla JS/HTML) with @siemens/ix and @siemens/ix-icons. Use kebab-case tags (e.g. <ix-button>, <ix-input>). Set properties as attributes. Use addEventListener for events. Import loaders: import { defineCustomElements } from '@siemens/ix/loader';`,
  };

  const docsContext = componentDocs
    .map((d) => `### ${d.title}\n${d.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `You are an expert code generator for the Siemens Industrial Experience (iX) design system.
Your job is to generate COMPLETE, WORKING, PRODUCTION-READY code using iX components.

RULES:
1. ONLY use components documented below — do NOT invent component names or props.
2. Generate code for the "${framework}" framework.
3. ${frameworkGuide[framework] || frameworkGuide.react}
4. Include ALL necessary imports, setup code, and styles.
5. Use proper form structure with labels, placeholders, and helper text where appropriate.
6. Apply iX design tokens (CSS custom properties) for any custom styling.
7. Return ONLY the code inside a single fenced code block — no prose before or after.
8. Add brief inline comments explaining key sections.
9. Make the code copy-paste ready — a developer should be able to use it immediately.
10. If any component in the documentation is marked deprecated, do NOT use it — use the recommended replacement instead and add a MIGRATION comment explaining the change.`;

  const fileSection = fileContent
    ? `\n---\n\n## Existing Code File ("${fileName || 'uploaded file'}")

Refactor or extend the following code to fulfil the user request using iX components:\n\n\`\`\`\n${fileContent.slice(0, 6000)}${fileContent.length > 6000 ? '\n// ... (truncated)' : ''}\n\`\`\`\n`
    : '';

  const userPrompt = `## Component Documentation (retrieved from iX docs)\n\n${docsContext}\n\n---\n\n## User Request\n\n"${description}"${fileSection}\n\nGenerate the complete ${framework} code for this UI.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  return callLLM({ messages, apiKey: key, provider, model, task: "codegen", temperature: 0.2, maxTokens: 4096 });
}

// ─── Routes ─────────────────────────────────────────────────────────

/**
 * Chat endpoint — BM25 RAG over the full iX documentation.
 * Supports multi-turn conversation via optional `history` array.
 *
 * Body: { question: string, apiKey?: string, history?: Array<{role,text}> }
 */
app.post("/chat", rateLimiter, async (req, res) => {
  const { question, apiKey: userApiKey, history, lang, provider = "siemens", model } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  const key = userApiKey || process.env.LLM_API_KEY;

  // Track analytics
  trackAnalytics(question, "chat", lang || "en");

  // RAG: Hybrid search (BM25 + cosine TF-IDF) over the full documentation corpus
  const matchedDocs = searchDocs(question, 10);

  if (matchedDocs.length === 0) {
    return res.json({
      answer:
        "I couldn't find relevant information in the iX documentation for that question. " +
        "Try rephrasing or ask about a specific component, installation, theming, or guidelines.",
      tier: "free",
      sources: [],
    });
  }

  // Build context with source references
  const topDocs = matchedDocs.slice(0, 8);
  const docsContext = topDocs
    .map((d, i) => `### [${i + 1}] ${d.title}\n${d.content}`)
    .join("\n\n---\n\n");

  // Collect unique source URLs for citation
  const sources = [...new Map(
    topDocs
      .filter((d) => d.url)
      .map((d) => [d.url, { title: d.title, url: d.url, deprecated: d.deprecated || false }])
  ).values()].slice(0, 5);

  // Free-tier fallback: no key available -> return extractive docs answer without LLM
  if (!key) {
    return res.json({
      answer: buildFreeTierAnswer(question, topDocs),
      tier: "free",
      sources,
      hasDeprecationWarnings: topDocs.some((d) => d.deprecated),
    });
  }

  // Build conversation messages (multi-turn)
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful, knowledgeable assistant for the Siemens Industrial Experience (iX) design system. " +
        "Answer the user's question strictly using the provided iX documentation excerpts below. " +
        "Be concise but thorough. If the docs contain code examples, include them formatted in markdown code blocks. " +
        "When referencing information, cite the source number in brackets like [1], [2] etc. " +
        "If the answer is not covered by the provided docs, say so honestly and suggest checking https://ix.siemens.io/. " +
        "Format your response using markdown for readability (headings, lists, code blocks)." +
        langInstruction(lang),
    },
  ];

  // Include recent conversation history (up to last 6 turns) for multi-turn context
  if (Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.text });
      } else if (msg.role === "bot") {
        messages.push({ role: "assistant", content: msg.text });
      }
    }
  }

  // Current question with documentation context
  messages.push({
    role: "user",
    content: `## iX Documentation excerpts\n\n${docsContext}\n\n---\n\n## Question\n\n${question}`,
  });

  try {
    const answer = await callLLM({ messages, apiKey: key, provider, model, task: "chat", temperature: 0.3, maxTokens: 2048 });
    res.json({
      answer,
      tier: "premium",
      sources,
      hasDeprecationWarnings: topDocs.some((d) => d.deprecated),
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error(`[${provider}] LLM API error:`, status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * POST /generate — AI Code Generator
 * Body: { description: string, framework: "react"|"angular"|"vue"|"webcomponents" }
 *
 * Flow:
 *   1. User sends a natural-language UI description
 *   2. RAG retrieves all matching component docs
 *   3. LLM generates framework-specific code
 *   4. Response includes generated code + matched components list
 */
app.post("/generate", rateLimiter, async (req, res) => {
  const { description, framework = "react", apiKey: userApiKey, fileContent, fileName, lang, provider = "siemens", model } = req.body;

  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  const validFrameworks = ["react", "angular", "angular-standalone", "vue", "webcomponents"];
  if (!validFrameworks.includes(framework)) {
    return res.status(400).json({
      error: `Invalid framework. Choose one of: ${validFrameworks.join(", ")}`,
    });
  }

  // Track analytics
  trackAnalytics(description, "generate", lang || "en");

  // Step 1 — RAG: Hybrid retrieval of relevant component documentation
  const matchedDocs = searchDocs(description, 15);

  if (matchedDocs.length === 0) {
    return res.json({
      code: null,
      matchedComponents: [],
      message:
        "No matching components found for your description. Try mentioning specific component names like button, input, checkbox, modal, etc.",
    });
  }

  // Cap context to avoid token limits (top 15 most relevant)
  const topDocs = matchedDocs.slice(0, 15);

  try {
    // Step 2 — LLM: generate code using retrieved docs
    const code = await generateCode(topDocs, description, framework, userApiKey, fileContent, fileName, provider, model);

    res.json({
      code,
      matchedComponents: topDocs.map((d) => ({
        title: d.title,
        score: d.score,
        source: d.source,
        url: d.url || null,
        deprecated: d.deprecated || false,
        matchedKeywords: d.matchedKeywords || [],
      })),
      framework,
      // Warn caller if any matched component doc contains deprecation signals
      hasDeprecationWarnings: topDocs.some((d) => d.deprecated),
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error("Code generation error:", status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * POST /migrate — code migration / deprecation assistant
 * Body: { code: string, apiKey?: string, lang?: string }
 * Returns: { migratedCode: string, summary: string }
 */
app.post("/migrate", rateLimiter, async (req, res) => {
  const { code, apiKey: userApiKey, lang, provider = "siemens", model } = req.body || {};
  if (!code || !code.toString().trim()) {
    return res.status(400).json({ error: "code is required" });
  }

  const key = userApiKey || process.env.LLM_API_KEY;
  if (!key) {
    return res.status(400).json({ error: "No API key available. Please add your AI API key in the ⚙️ Settings tab." });
  }

  // Track analytics
  trackAnalytics(code.toString().slice(0, 200), "migrate", lang || "en");

  try {
    // Retrieve relevant docs to give the LLM context about iX components
    const matchedDocs = searchDocs(code.toString(), 12);
    const topDocs = matchedDocs.slice(0, 12);

    // Ask the code-generator to produce migrated code. Use the original file content
    // so the generator can refactor/replace deprecated components where applicable.
    const migratedCode = await generateCode(
      topDocs,
      `Migrate the following code to use the Siemens iX design system. Replace deprecated components with their recommended replacements and keep behavior identical. Return complete, copy-paste-ready code.`,
      "react",
      userApiKey,
      code.toString(),
      "uploaded-file",
      provider,
      model
    );

    // Ask for a brief summary of the migration steps performed
    const docsContext = topDocs
      .map((d, i) => `### ${i + 1} ${d.title}\n${d.content}`)
      .join("\n\n---\n\n");

    const summaryQuestion =
      "Provide a short (2-6 sentence) summary of the migration performed: list deprecated components replaced, notable API changes, and any manual follow-ups the developer should verify.";

    const summary = await askAI(docsContext, `${summaryQuestion}\n\nOriginal code:\n${code.toString().slice(0, 4000)}`, userApiKey, lang || "en", provider, model);

    res.json({ migratedCode, summary });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message || "Migration failed";
    console.error("Migration error:", status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * POST /refine — conversational code refinement
 * Body: { code: string, instruction: string, framework: string, apiKey?: string, provider?: string, model?: string }
 * Returns: { code: string }
 */
app.post("/refine", rateLimiter, async (req, res) => {
  const { code, instruction, framework = "react", apiKey: userApiKey, provider = "siemens", model } = req.body || {};
  if (!code || !instruction) {
    return res.status(400).json({ error: "code and instruction are required" });
  }
  const key = userApiKey || process.env.LLM_API_KEY;
  if (!key) {
    return res.status(400).json({ error: "No API key available. Please add your API key in ⚙️ Settings." });
  }

  const systemPrompt = `You are an expert code editor for the Siemens Industrial Experience (iX) design system. 
Modify the provided code ONLY according to the user's instruction and return the complete updated code in a single fenced code block.
Do not explain — only return the full updated code.`;

  const userPrompt = `Framework: ${framework}\n\nExisting code:\n\`\`\`\n${code}\n\`\`\`\n\nInstruction: ${instruction}\n\nReturn the complete updated code.`;

  try {
    const refined = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      apiKey: key,
      provider,
      model,
      task: "codegen",
      temperature: 0.2,
      maxTokens: 4096,
    });
    res.json({ code: refined });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error(`[${provider}] Refine error:`, status, message);
    res.status(status).json({ error: message });
  }
});


/**
 * GET /suggest?q=<partial-query>
 * Lightweight type-ahead — returns top-5 matching doc titles + URLs.
 * No LLM call, no API key required. Used for search autocomplete in the UI.
 */
app.get("/suggest", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q || q.length < 2) return res.json({ suggestions: [] });
  const results = searchDocs(q, 5);
  res.json({
    suggestions: results.map((r) => ({
      title: r.title,
      url: r.url || null,
      deprecated: r.deprecated || false,
    })),
  });
});

/**
 * POST /deprecation-check
 * Proactive deprecation-alert endpoint.
 * Body: { components: string[] }  — list of component/API names to check.
 * Returns a list of alerts for any known-deprecated items found in the docs.
 * No LLM call, no API key required — pure doc corpus search.
 */
app.post("/deprecation-check", (req, res) => {
  const { components = [] } = req.body;
  if (!Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: "components array is required" });
  }

  const alerts = [];
  for (const name of components.slice(0, 20)) {
    const lower = name.toLowerCase().trim();
    if (!lower) continue;
    // Find docs that mention this component AND contain a deprecation signal
    const hits = docs.filter(
      (d) =>
        (d.title.toLowerCase().includes(lower) ||
          d.content.toLowerCase().includes(lower)) &&
        hasDeprecationSignal(d.content)
    );
    if (hits.length > 0) {
      // Extract a short excerpt around the first deprecation signal
      let excerpt = "";
      const hit = hits[0];
      for (const sig of DEPRECATION_SIGNALS) {
        const idx = hit.content.toLowerCase().indexOf(sig);
        if (idx !== -1) {
          excerpt = hit.content.slice(Math.max(0, idx - 40), idx + 120).trim();
          break;
        }
      }
      alerts.push({
        component: name,
        deprecated: true,
        docTitle: hit.title,
        docUrl: hit.url || null,
        excerpt,
      });
    }
  }
  res.json({ alerts });
});

/**
 * GET /analytics
 * Returns aggregated usage analytics: top queries, endpoint counts, recent queries.
 * Intended for documentation-maintainers to identify gaps and improve guidance.
 */
app.get("/analytics", (req, res) => {
  // Top 30 most-asked questions
  const topQueries = [...analytics.queryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([text, count]) => ({ text, count }));

  res.json({
    endpointCounts: analytics.endpointCounts,
    totalTracked: analytics.recentQueries.length,
    topQueries,
    recentQueries: analytics.recentQueries.slice(0, 20),
  });
});

/** Health check */
app.get("/health", (req, res) => {
  const deprecatedDocs = docs.filter((d) => hasDeprecationSignal(d.content)).length;
  res.json({
    status: "ok",
    docs: docs.length,
    deprecatedChunks: deprecatedDocs,
    analytics: {
      totalQueries: analytics.recentQueries.length,
      endpointCounts: analytics.endpointCounts,
    },
    features: [
      "hybrid-search-bm25-cosine",
      "usage-analytics",
      "deprecation-alerts",
      "multi-language",
      "voice-input-ready",
      "query-expansion",
      "conversation-history",
      "source-citations",
      "deprecation-detection",
      "rate-limiting",
      "section-type-boost",
      "url-dedup",
    ],
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`iX Chatbot backend running on http://localhost:${PORT}`);
  console.log(`  POST /chat      — chatbot Q&A (rate-limited)`);
  console.log(`  POST /generate  — AI code generator (rate-limited)`);
  console.log(`  GET  /suggest   — type-ahead suggestions`);
  console.log(`  GET  /health    — health check`);
});
