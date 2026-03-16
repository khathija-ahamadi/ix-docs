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

// ─── Retrieval helpers ──────────────────────────────────────────────

/**
 * Original single-best-match retrieval (used by /chat).
 */
function findRelevantDoc(question) {
  question = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

  let bestMatch = null;
  let bestScore = 0;

  for (let doc of docs) {
    let score = 0;
    for (let keyword of doc.keywords) {
      if (question.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = doc.content;
    }
  }

  return bestMatch;
}

/**
 * Multi-document retrieval for code generation.
 * Returns ALL docs whose keyword score exceeds the threshold,
 * sorted by relevance (highest first).
 */
function findMultipleRelevantDocs(description, minScore = 3) {
  const normalised = description.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

  const scored = docs
    .map((doc) => {
      let score = 0;
      const matchedKeywords = [];
      for (const keyword of doc.keywords) {
        if (normalised.includes(keyword.toLowerCase())) {
          score += keyword.length;
          matchedKeywords.push(keyword);
        }
      }
      return { title: doc.title, content: doc.content, score, matchedKeywords };
    })
    .filter((d) => d.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored;
}

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

/** Existing chatbot endpoint */
app.post("/chat", async (req, res) => {
  const { question, apiKey: userApiKey } = req.body;

  const context = findRelevantDoc(question);

  if (!context) {
    return res.json({ answer: "Sorry, no relevant information found." });
  }

  try {
    const answer = await askAI(context, question, userApiKey);
    res.json({ answer });
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

  // Step 1 — RAG: retrieve relevant component documentation
  const matchedDocs = findMultipleRelevantDocs(description);

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
        matchedKeywords: d.matchedKeywords,
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
