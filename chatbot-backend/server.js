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

function findRelevantDoc(question) {
  question = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

  let bestMatch = null;
  let bestScore = 0;

  for (let doc of docs) {
    let score = 0;
    for (let keyword of doc.keywords) {
      if (question.includes(keyword.toLowerCase())) {
        // Longer keyword matches are more specific – weight them higher
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

async function askAI(context, question) {
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
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      httpsAgent,
    }
  );

  return response.data.choices[0].message.content;
}

app.post("/chat", async (req, res) => {
  const { question } = req.body;

  const context = findRelevantDoc(question);

  if (!context) {
    return res.json({ answer: "Sorry, no relevant information found." });
  }

  try {
    const answer = await askAI(context, question);
    res.json({ answer });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message;
    console.error("Groq API error:", status, message);
    res.status(status).json({ error: message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`iX Chatbot backend running on http://localhost:${PORT}`);
});
