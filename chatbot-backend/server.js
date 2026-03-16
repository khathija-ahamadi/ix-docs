require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const https = require("https");
const docs = require("./docs.json");

// Bypass SSL certificate verification (needed behind corporate proxies)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
app.use(cors());
app.use(express.json());

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
 * Build a BM25 inverted index over the docs corpus.
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
  return { docTermFreqs, docLengths, idf, avgDl };
}

/**
 * Search the corpus using BM25 scoring.
 * Returns top-K docs sorted by relevance score.
 */
function searchDocs(query, topK = 10) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { docTermFreqs, docLengths, idf, avgDl } = searchIndex;
  const k1 = 1.5;
  const b = 0.75;
  const lowerQuery = query.toLowerCase();

  const scores = docs.map((doc, i) => {
    let score = 0;
    const tf = docTermFreqs[i];
    const dl = docLengths[i];

    for (const qt of queryTokens) {
      const termFreq = tf[qt] || 0;
      if (termFreq === 0) continue;
      const idfVal = idf[qt] || 0;
      const tfNorm =
        (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + (b * dl) / avgDl));
      score += idfVal * tfNorm;
    }

    // Boost documents whose title closely matches the query
    const lowerTitle = doc.title.toLowerCase();
    if (lowerTitle.includes(lowerQuery)) score *= 2.0;
    else {
      // Partial title match boost (any query token appears in title)
      const titleHits = queryTokens.filter((t) => lowerTitle.includes(t)).length;
      if (titleHits > 0) score *= 1 + 0.3 * (titleHits / queryTokens.length);
    }

    const matchedKeywords = queryTokens.filter((t) => (tf[t] || 0) > 0);
    return { title: doc.title, content: doc.content, score, source: doc.source, matchedKeywords };
  });

  return scores
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Build search index at startup
const searchIndex = buildSearchIndex(docs);
console.log(`BM25 search index built over ${docs.length} document chunks`);

// ─── LLM helpers ────────────────────────────────────────────────────

async function askAI(context, question, userApiKey) {
  const key = userApiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('No API key available. Please add your AI API key in the ⚙️ Settings tab.');
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for the Siemens Industrial Experience (iX) design system. Answer only from the provided documentation.",
        },
        {
          role: "user",
          content: `Documentation: ${context}\n\nQuestion: ${question}`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      httpsAgent,
    }
  );

  return response.data.choices[0].message.content;
}

/**
 * Code-generation-specific LLM call.
 * Receives multiple component docs + the user description + target framework.
 */
async function generateCode(componentDocs, description, framework, userApiKey) {
  const key = userApiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('No API key available. Please add your AI API key in the ⚙️ Settings tab.');
  const frameworkGuide = {
    react: `Use React with @siemens/ix-react. Import components like: import { IxButton, IxInput } from '@siemens/ix-react'; Use JSX with PascalCase tags (e.g. <IxButton>, <IxInput>). For boolean props use prop={true}. For events use onEventName.`,
    angular: `Use Angular with @siemens/ix-angular. For standalone components: import { IxButton } from '@siemens/ix-angular/standalone'; For module setup: import { IxModule } from '@siemens/ix-angular'. Use kebab-case tags in templates (e.g. <ix-button>, <ix-input>). Bind props with [prop]="value". Bind events with (eventName)="handler($event)".`,
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
9. Make the code copy-paste ready — a developer should be able to use it immediately.`;

  const userPrompt = `## Component Documentation (retrieved from iX docs)

${docsContext}

---

## User Request

"${description}"

Generate the complete ${framework} code for this UI.`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      httpsAgent,
    }
  );

  return response.data.choices[0].message.content;
}

// ─── Routes ─────────────────────────────────────────────────────────

/** Chat endpoint — BM25 RAG over the full iX documentation */
app.post("/chat", async (req, res) => {
  const { question, apiKey: userApiKey } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  const key = userApiKey || process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(400).json({ error: "No API key available. Please add your AI API key in the ⚙️ Settings tab." });
  }

  // RAG: BM25 retrieval over the full documentation corpus
  const matchedDocs = searchDocs(question, 10);

  if (matchedDocs.length === 0) {
    return res.json({
      answer:
        "I couldn't find relevant information in the iX documentation for that question. " +
        "Try rephrasing or ask about a specific component, installation, theming, or guidelines.",
    });
  }

  // Cap context to top 8 chunks to stay within token limits
  const docsContext = matchedDocs
    .slice(0, 8)
    .map((d) => `### ${d.title}\n${d.content}`)
    .join("\n\n---\n\n");

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful, knowledgeable assistant for the Siemens Industrial Experience (iX) design system. " +
              "Answer the user's question strictly using the provided iX documentation excerpts. " +
              "Be concise but thorough. If the docs contain code examples, include them. " +
              "If the answer is not covered by the provided docs, say so honestly and suggest checking https://ix.siemens.io/.",
          },
          {
            role: "user",
            content: `## iX Documentation excerpts\n\n${docsContext}\n\n---\n\n## Question\n\n${question}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        httpsAgent,
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer, tier: "premium" });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error("Groq API error:", status, message);
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
app.post("/generate", async (req, res) => {
  const { description, framework = "react", apiKey: userApiKey } = req.body;

  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  const validFrameworks = ["react", "angular", "vue", "webcomponents"];
  if (!validFrameworks.includes(framework)) {
    return res.status(400).json({
      error: `Invalid framework. Choose one of: ${validFrameworks.join(", ")}`,
    });
  }

  // Step 1 — RAG: BM25 retrieval of relevant component documentation
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
    const code = await generateCode(topDocs, description, framework, userApiKey);

    res.json({
      code,
      matchedComponents: topDocs.map((d) => ({
        title: d.title,
        score: d.score,
        source: d.source,
        matchedKeywords: d.matchedKeywords || [],
      })),
      framework,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error("Code generation error:", status, message);
    res.status(status).json({ error: message });
  }
});

/** Health check */
app.get("/health", (req, res) => {
  res.json({ status: "ok", docs: docs.length });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`iX Chatbot backend running on http://localhost:${PORT}`);
  console.log(`  POST /chat      — chatbot Q&A`);
  console.log(`  POST /generate  — AI code generator`);
  console.log(`  GET  /health    — health check`);
});
