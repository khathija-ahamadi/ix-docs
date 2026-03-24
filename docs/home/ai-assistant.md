---
sidebar_label: AI Assistant
title: iX AI Assistant User Guide
description: Short guide for using the iX AI Assistant.
---

## Overview

The iX AI Assistant is a floating panel for:

- Documentation Q&A (`Chat`)
- UI code generation (`Code Gen`)
- Migration help (`Migrate`)
- Usage insights (`Analytics`)
- Settings, and help (`Settings`, `Help`)

Supported response languages: English (`en`), German (`de`), Chinese (`zh`), French (`fr`), Spanish (`es`), Japanese (`ja`), Portuguese (`pt`), Korean (`ko`).

## Access

- Open the assistant from the floating button at the bottom right.
- Main tabs: `Chat`, `Code Gen`
- More menu: `Migrate`, `Analytics`, `Settings`, `Help`

## Quick start

1. Open `Settings`.
2. Add a Siemens or Groq API key.
3. Choose provider and model separately for `Chat` and `Code Gen`.
4. Use `Chat` for questions, `Code Gen` for UI generation, and `Migrate` for upgrade help.

## Tabs

### Chat

- Ask questions about Siemens iX documentation.
- Free mode returns documentation-based answers.
- Premium mode uses LLM + documentation context.
- Responses can include source links and deprecation warnings.
- Voice input and read-aloud are supported.
- Recent conversation turns are included for follow-up questions.

### Code Gen

- Generates iX UI code from a prompt.
- Supported frameworks:
   - `react`
   - `angular`
   - `angular-standalone`
   - `vue`
   - `webcomponents`
- Shows matched components.
- Supports copy, download, regenerate, and StackBlitz export.
- Requires an API key.

### Migrate

- Helps update older iX usage.
- Two modes are available:
   - `API migration`
   - `Version upgrade`
- Returns a summary, diff, and updated code.
- Requires an API key.

### Analytics

- Shows backend usage data such as top questions, recent queries, and endpoint counts.
- Data is in memory and resets when the backend restarts.

### Settings

- Manage API keys.
- Choose provider and model independently for `Chat` and `Code Gen`.
- Set response language.

#### Providers

- `Siemens`
- `Groq`

#### Models

- Siemens:
   - `glm-5`
   - `qwen3-30b-a3b-instruct-2507`
   - `qwen3-30b-a3b-thinking-2507`
   - `deepseek-r1-0528-qwen3-8b`
   - `devstral-small-2505`
   - `mistral-7b-instruct`
- Groq:
   - `llama-3.3-70b-versatile`
   - `llama-3.1-8b-instant`

Default models:

- Chat: `glm-5` for Siemens, `llama-3.3-70b-versatile` for Groq
- Code Gen: `devstral-small-2505` for Siemens, `llama-3.3-70b-versatile` for Groq

### Help

- Links to docs, blog, support, and starter app resources.

## Feedback and history

- `Chat`, `Code Gen`, and `Migrate` support thumbs up/down feedback.
- Chat and Code Gen history are stored locally.
- Each history list keeps up to 10 saved sessions.

## Free vs premium

### Free

- Documentation-based chat answers
- Source links when available

### Premium

- LLM-powered chat
- Code generation
- Migration support
- Provider/model selection

## Storage and limits

- Chat history: local storage, max 10 sessions
- Code Gen history: local storage, max 10 sessions
- Analytics: in memory only
- Backend rate limiting applies per IP

## Troubleshooting

- No AI response, code generation, or migration: add an API key in `Settings`
- Rate limit error: wait and try again
- No analytics: make sure the backend is running
