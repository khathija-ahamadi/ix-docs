import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';

const CHAT_URL = 'http://localhost:5000/chat';
const GENERATE_URL = 'http://localhost:5000/generate';

type Mode = 'chat' | 'codegen';
type Framework = 'react' | 'angular' | 'vue' | 'webcomponents';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface MatchedComponent {
  title: string;
  score: number;
  matchedKeywords: string[];
}

const FRAMEWORK_LABELS: Record<Framework, string> = {
  react: 'React',
  angular: 'Angular',
  vue: 'Vue',
  webcomponents: 'Web Components',
};

const EXAMPLE_PROMPTS = [
  'Create a login page with username input, password input, login button, and remember me checkbox',
  'Build a dashboard with a content header, two KPI cards, and a line chart',
  'Create a settings page with a form containing toggle switches, a select dropdown, and save/cancel buttons',
  'Build a data table page with pagination, a search bar, and action buttons for add/edit/delete',
];

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');

  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: '👋 Hello! Ask me anything about the Siemens iX design system — components, installation, theming, guidelines and more.',
    },
  ]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // ── Code Generator state ──
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<Framework>('react');
  const [generatedCode, setGeneratedCode] = useState('');
  const [matchedComponents, setMatchedComponents] = useState<MatchedComponent[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-scroll chat ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── Focus on open / mode switch ──
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'chat') {
      chatInputRef.current?.focus();
    } else {
      textareaRef.current?.focus();
    }
  }, [isOpen, mode]);

  // ════════════════════════════════════════════════════════════
  //  CHAT LOGIC
  // ════════════════════════════════════════════════════════════

  const sendMessage = async () => {
    if (!question.trim() || chatLoading) return;
    const userMsg = question.trim();
    setQuestion('');
    setChatError('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'bot', text: data.answer }]);
    } catch (err: any) {
      setChatError(err.message || 'Something went wrong');
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  const clearChat = () => {
    setChatMessages([
      { role: 'bot', text: 'Chat cleared. Ask me anything about Siemens iX!' },
    ]);
    setChatError('');
  };

  // ════════════════════════════════════════════════════════════
  //  CODE GENERATOR LOGIC
  // ════════════════════════════════════════════════════════════

  const handleGenerate = async () => {
    if (!description.trim() || codeLoading) return;
    setCodeError('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeMessage('');
    setCodeLoading(true);

    try {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), framework }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.code) {
        setGeneratedCode(data.code);
        setMatchedComponents(data.matchedComponents || []);
      } else {
        setCodeMessage(data.message || 'No code generated.');
      }
    } catch (err: any) {
      setCodeError(err.message || 'Something went wrong');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopy = async () => {
    const codeOnly = generatedCode
      .replace(/^```[\w-]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();
    try {
      await navigator.clipboard.writeText(codeOnly);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = codeOnly;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setDescription(prompt);
    textareaRef.current?.focus();
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate();
  };

  const clearCodeGen = () => {
    setDescription('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeError('');
    setCodeMessage('');
    textareaRef.current?.focus();
  };

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Single floating action button ── */}
      <button
        className={styles.fab}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="iX AI Assistant"
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* ── Unified panel ── */}
      {isOpen && (
        <div className={styles.panel}>
          {/* Header with mode tabs */}
          <div className={styles.header}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${mode === 'chat' ? styles.tabActive : ''}`}
                onClick={() => setMode('chat')}
              >
                💬 Chat
              </button>
              <button
                className={`${styles.tab} ${mode === 'codegen' ? styles.tabActive : ''}`}
                onClick={() => setMode('codegen')}
              >
                &lt;/&gt; Code Gen
              </button>
            </div>
            <button
              className={styles.clearBtn}
              onClick={mode === 'chat' ? clearChat : clearCodeGen}
              title="Clear"
            >
              🗑
            </button>
          </div>

          {/* ─────── Chat View ─────── */}
          {mode === 'chat' && (
            <div className={styles.chatBody}>
              <div className={styles.messages}>
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${styles.bubble} ${
                      msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot
                    }`}
                  >
                    <span className={styles.bubbleLabel}>
                      {msg.role === 'user' ? 'You' : 'iX Bot'}
                    </span>
                    <p className={styles.bubbleText}>{msg.text}</p>
                  </div>
                ))}

                {chatLoading && (
                  <div className={`${styles.bubble} ${styles.bubbleBot}`}>
                    <span className={styles.bubbleLabel}>iX Bot</span>
                    <span className={styles.typing}>Thinking…</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {chatError && (
                <div className={styles.error}>
                  ⚠️ {chatError}
                  <button className={styles.errorClose} onClick={() => setChatError('')}>
                    ✕
                  </button>
                </div>
              )}

              <div className={styles.inputRow}>
                <input
                  ref={chatInputRef}
                  className={styles.input}
                  type="text"
                  placeholder="Ask about Siemens iX..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  disabled={chatLoading}
                />
                <button
                  className={styles.sendBtn}
                  onClick={sendMessage}
                  disabled={chatLoading || !question.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* ─────── Code Generator View ─────── */}
          {mode === 'codegen' && (
            <div className={styles.codeBody}>
              {/* Description input */}
              <div className={styles.section}>
                <label className={styles.label}>Describe your UI</label>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  placeholder="e.g. Create a login page with username, password, and login button"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleCodeKeyDown}
                  rows={3}
                  disabled={codeLoading}
                />
                <span className={styles.hint}>Press Ctrl+Enter to generate</span>
              </div>

              {/* Example prompts */}
              {!generatedCode && !codeLoading && (
                <div className={styles.section}>
                  <label className={styles.label}>Try an example</label>
                  <div className={styles.examples}>
                    {EXAMPLE_PROMPTS.map((prompt, i) => (
                      <button
                        key={i}
                        className={styles.exampleBtn}
                        onClick={() => handleExampleClick(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Framework selector */}
              <div className={styles.section}>
                <label className={styles.label}>Framework</label>
                <div className={styles.frameworkRow}>
                  {(Object.entries(FRAMEWORK_LABELS) as [Framework, string][]).map(
                    ([key, label]) => (
                      <button
                        key={key}
                        className={`${styles.frameworkBtn} ${
                          framework === key ? styles.frameworkBtnActive : ''
                        }`}
                        onClick={() => setFramework(key)}
                        disabled={codeLoading}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Generate button */}
              <button
                className={styles.generateBtn}
                onClick={handleGenerate}
                disabled={codeLoading || !description.trim()}
              >
                {codeLoading ? <span className={styles.spinner} /> : '⚡'}{' '}
                {codeLoading ? 'Generating…' : 'Generate Code'}
              </button>

              {/* Error */}
              {codeError && (
                <div className={styles.error}>
                  ⚠️ {codeError}
                  <button className={styles.errorClose} onClick={() => setCodeError('')}>
                    ✕
                  </button>
                </div>
              )}

              {/* Info message */}
              {codeMessage && (
                <div className={styles.info}>💡 {codeMessage}</div>
              )}

              {/* Matched components */}
              {matchedComponents.length > 0 && (
                <div className={styles.section}>
                  <label className={styles.label}>
                    📚 Components used ({matchedComponents.length})
                  </label>
                  <div className={styles.chips}>
                    {matchedComponents.map((comp, i) => (
                      <span
                        key={i}
                        className={styles.chip}
                        title={`Keywords: ${comp.matchedKeywords.join(', ')}`}
                      >
                        {comp.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated code */}
              {generatedCode && (
                <div className={styles.section}>
                  <div className={styles.codeHeader}>
                    <label className={styles.label}>Generated Code</label>
                    <button className={styles.copyBtn} onClick={handleCopy}>
                      {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <pre className={styles.codeBlock}>
                    <code>
                      {generatedCode
                        .replace(/^```[\w-]*\n?/gm, '')
                        .replace(/```$/gm, '')
                        .trim()}
                    </code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
