import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';

const CHAT_URL = 'http://localhost:5000/chat';
const GENERATE_URL = 'http://localhost:5000/generate';
const API_KEY_STORAGE = 'ix-assistant-api-key';
const CHAT_HISTORY_STORAGE = 'ix-assistant-chat-history';
const CODEGEN_HISTORY_STORAGE = 'ix-assistant-codegen-history';
const MAX_HISTORY = 5;

// ── Web Crypto: AES-GCM encryption for localStorage ────────────────────────
// Key is derived via PBKDF2 from a fixed app passphrase.
// This prevents the raw API key from sitting as plain text in localStorage.
async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('ix-ai-assistant-v1'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('ix-api-salt-2026'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(plain: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  );
  // Prepend IV to ciphertext, then base64-encode the whole thing
  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptApiKey(stored: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}

type Mode = 'chat' | 'codegen' | 'settings';
type Framework = 'react' | 'angular' | 'vue' | 'webcomponents';

interface Source {
  title: string;
  url: string;
}

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  tier?: 'free' | 'premium';
  sources?: Source[];
}

interface MatchedComponent {
  title: string;
  score: number;
  url?: string;
  matchedKeywords: string[];
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

interface CodeGenSession {
  id: string;
  title: string;
  timestamp: number;
  description: string;
  framework: Framework;
  code: string;
  matchedComponents: MatchedComponent[];
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

const MAX_WIDTH_RATIO = 0.95;
const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT_VH = 70; // percent of viewport height
const PANEL_BOTTOM_PX = 92; // must match CSS .panel { bottom }
const PANEL_RIGHT_PX = 24; // must match CSS .panel { right }
const VIEWPORT_PADDING = 8; // breathing room from edges

// ── History helpers ─────────────────────────────────────────────────
function loadChatHistory(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(sessions: ChatSession[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_STORAGE, JSON.stringify(sessions.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

function loadCodeGenHistory(): CodeGenSession[] {
  try {
    const raw = localStorage.getItem(CODEGEN_HISTORY_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCodeGenHistory(sessions: CodeGenSession[]) {
  try {
    localStorage.setItem(CODEGEN_HISTORY_STORAGE, JSON.stringify(sessions.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function deriveSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Empty session';
  return firstUser.text.length > 50 ? firstUser.text.slice(0, 50) + '…' : firstUser.text;
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');

  // ── Resize state ──
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const defaultHeight = Math.round(window.innerHeight * (DEFAULT_HEIGHT_VH / 100));
  const [panelHeight, setPanelHeight] = useState(defaultHeight);

  // Initial dimensions are the minimum – users can only resize larger
  const MIN_WIDTH = DEFAULT_WIDTH;
  const MIN_HEIGHT = defaultHeight;
  const resizing = useRef<{
    active: boolean;
    edge: 'corner' | 'top' | 'left';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── API Key state ──
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true); // true while decrypting on mount

  const hasPremium = apiKey.trim().length > 0;

  // ── History state ──
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [codeGenHistory, setCodeGenHistory] = useState<CodeGenSession[]>([]);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showCodeGenHistory, setShowCodeGenHistory] = useState(false);

  // ── Load history on mount ──
  useEffect(() => {
    setChatHistory(loadChatHistory());
    setCodeGenHistory(loadCodeGenHistory());
  }, []);

  // ── Decrypt stored key on mount ──
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(API_KEY_STORAGE);
        if (stored) {
          const plain = await decryptApiKey(stored);
          setApiKey(plain);
        }
      } catch {
        // Stored value is corrupt or from old plain-text version — clear it
        localStorage.removeItem(API_KEY_STORAGE);
      } finally {
        setKeyLoading(false);
      }
    })();
  }, []);

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

  // ── Resize event handlers ──
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const r = resizing.current;
      if (!r?.active) return;
      e.preventDefault();

      // Use clientWidth/clientHeight (excludes scrollbars) for accurate bounds
      const vpW = document.documentElement.clientWidth;
      const vpH = document.documentElement.clientHeight;
      const maxW = vpW - PANEL_RIGHT_PX - VIEWPORT_PADDING;
      const maxH = vpH - PANEL_BOTTOM_PX - VIEWPORT_PADDING;

      if (r.edge === 'corner' || r.edge === 'left') {
        // Panel is right-anchored, so dragging left increases width
        // Also clamp so left edge doesn't go past VIEWPORT_PADDING
        const newW = Math.min(maxW, Math.max(MIN_WIDTH, r.startW + (r.startX - e.clientX)));
        setPanelWidth(newW);
      }
      if (r.edge === 'corner' || r.edge === 'top') {
        // Panel is bottom-anchored, so dragging up increases height
        const newH = Math.min(maxH, Math.max(MIN_HEIGHT, r.startH + (r.startY - e.clientY)));
        setPanelHeight(newH);
      }
    };

    const onPointerUp = () => {
      if (resizing.current) {
        resizing.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const startResize = (
    e: React.PointerEvent,
    edge: 'corner' | 'top' | 'left'
  ) => {
    e.preventDefault();
    resizing.current = {
      active: true,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: panelWidth,
      startH: panelHeight,
    };
    document.body.style.cursor =
      edge === 'corner' ? 'nwse-resize' : edge === 'top' ? 'ns-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Auto-scroll chat ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── Focus on open / mode switch ──
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'chat') {
      chatInputRef.current?.focus();
    } else if (mode === 'codegen') {
      textareaRef.current?.focus();
    }
  }, [isOpen, mode]);

  // ════════════════════════════════════════════════════════════
  //  CHAT LOGIC
  // ════════════════════════════════════════════════════════════

  // ── API Key handlers ──
  const saveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    try {
      const encrypted = await encryptApiKey(trimmed);
      localStorage.setItem(API_KEY_STORAGE, encrypted);
    } catch {
      // Fallback: if Web Crypto somehow unavailable, skip storage
    }
    setApiKey(trimmed);
    setApiKeyInput('');
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2500);
  };

  const clearApiKey = () => {
    try { localStorage.removeItem(API_KEY_STORAGE); } catch {}
    setApiKey('');
    setApiKeyInput('');
    // Clear any generated output that relied on the removed key
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeMessage('');
    setCodeError('');
  };

  const sendMessage = async () => {
    if (!question.trim() || chatLoading) return;
    const userMsg = question.trim();
    setQuestion('');
    setChatError('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

    setChatLoading(true);
    try {
      // Send conversation history for multi-turn context
      const recentHistory = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg, apiKey, history: recentHistory }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: 'bot', text: data.answer, tier: 'premium', sources: data.sources || [] },
      ]);
    } catch (err: any) {
      setChatError(err.message || 'Something went wrong');
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  // ── Save current chat session to history ──
  const saveChatSession = () => {
    // Only save if there are user messages beyond the welcome message
    const hasUserMessages = chatMessages.some((m) => m.role === 'user');
    if (!hasUserMessages) return;

    const session: ChatSession = {
      id: Date.now().toString(),
      title: deriveSessionTitle(chatMessages),
      timestamp: Date.now(),
      messages: chatMessages,
    };
    const updated = [session, ...chatHistory].slice(0, MAX_HISTORY);
    setChatHistory(updated);
    saveChatHistory(updated);
  };

  const clearChat = () => {
    saveChatSession();
    setChatMessages([
      { role: 'bot', text: 'Chat cleared. Ask me anything about Siemens iX!' },
    ]);
    setChatError('');
  };

  const restoreChatSession = (session: ChatSession) => {
    // Save current before restoring
    saveChatSession();
    setChatMessages(session.messages);
    setShowChatHistory(false);
  };

  const deleteChatSession = (id: string) => {
    const updated = chatHistory.filter((s) => s.id !== id);
    setChatHistory(updated);
    saveChatHistory(updated);
  };

  // ════════════════════════════════════════════════════════════
  //  CODE GENERATOR LOGIC
  // ════════════════════════════════════════════════════════════

  const handleGenerate = async () => {
    if (!description.trim() || codeLoading) return;

    // Gate code generation behind API key
    if (!hasPremium) {
      setCodeMessage(
        '🔑 Code generation requires an AI model. Add your AI API key in the ⚙️ Settings tab to unlock this feature.'
      );
      return;
    }

    setCodeError('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeMessage('');
    setCodeLoading(true);

    // Auto-save previous generation before starting a new one
    saveCodeGenSession();

    try {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), framework, apiKey }),
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

  // ── Save current code gen session to history ──
  const saveCodeGenSession = () => {
    if (!generatedCode) return;
    const session: CodeGenSession = {
      id: Date.now().toString(),
      title: description.length > 50 ? description.slice(0, 50) + '…' : description,
      timestamp: Date.now(),
      description,
      framework,
      code: generatedCode,
      matchedComponents,
    };
    const updated = [session, ...codeGenHistory].slice(0, MAX_HISTORY);
    setCodeGenHistory(updated);
    saveCodeGenHistory(updated);
  };

  const clearCodeGen = () => {
    saveCodeGenSession();
    setDescription('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeError('');
    setCodeMessage('');
    textareaRef.current?.focus();
  };

  const restoreCodeGenSession = (session: CodeGenSession) => {
    // Save current before restoring
    saveCodeGenSession();
    setDescription(session.description);
    setFramework(session.framework);
    setGeneratedCode(session.code);
    setMatchedComponents(session.matchedComponents);
    setCodeError('');
    setCodeMessage('');
    setShowCodeGenHistory(false);
  };

  const deleteCodeGenSession = (id: string) => {
    const updated = codeGenHistory.filter((s) => s.id !== id);
    setCodeGenHistory(updated);
    saveCodeGenHistory(updated);
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
        <div
          ref={panelRef}
          className={styles.panel}
          style={{ width: panelWidth, height: panelHeight, maxHeight: panelHeight }}
        >
          {/* ── Resize handles ── */}
          <div
            className={styles.resizeTop}
            onPointerDown={(e) => startResize(e, 'top')}
          />
          <div
            className={styles.resizeLeft}
            onPointerDown={(e) => startResize(e, 'left')}
          />
          <div
            className={styles.resizeCorner}
            onPointerDown={(e) => startResize(e, 'corner')}
          />

          {/* Header with mode tabs */}
          <div className={styles.header}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${mode === 'chat' ? styles.tabActive : ''}`}
                onClick={() => { setMode('chat'); setShowChatHistory(false); setShowCodeGenHistory(false); }}
              >
                💬 Chat
              </button>
              <button
                className={`${styles.tab} ${mode === 'codegen' ? styles.tabActive : ''}`}
                onClick={() => { setMode('codegen'); setShowChatHistory(false); setShowCodeGenHistory(false); }}
              >
                &lt;/&gt; Code Gen
              </button>
              <button
                className={`${styles.tab} ${mode === 'settings' ? styles.tabActive : ''}`}
                onClick={() => { setMode('settings'); setShowChatHistory(false); setShowCodeGenHistory(false); }}
                title="API Key Settings"
              >
                ⚙️ Settings
              </button>
            </div>
            {mode !== 'settings' && (
              <div className={styles.headerActions}>
                <button
                  className={styles.historyBtn}
                  onClick={() => {
                    if (mode === 'chat') setShowChatHistory((v) => !v);
                    else setShowCodeGenHistory((v) => !v);
                  }}
                  title="History"
                >
                  🕘
                </button>
                <button
                  className={styles.clearBtn}
                  onClick={mode === 'chat' ? clearChat : clearCodeGen}
                  title="Clear"
                >
                  🗑
                </button>
              </div>
            )}
          </div>

          {/* ─────── Tier banner ─────── */}
          {mode !== 'settings' && !keyLoading && (
            <div className={hasPremium ? styles.tierBannerPremium : styles.tierBannerFree}>
              {hasPremium ? (
                <>🔑 <strong>Premium</strong> — AI-powered via your API key</>
              ) : (
                <>
                  🆓 <strong>Free tier</strong> —{' '}
                  <button className={styles.tierLink} onClick={() => setMode('settings')}>
                    Add API key
                  </button>{' '}
                  for AI responses.
                </>
              )}
            </div>
          )}

          {/* ─────── Chat View ─────── */}
          {mode === 'chat' && (
            <div className={styles.chatBody}>
              {/* Chat History Drawer (overlay) */}
              {showChatHistory && (
                <div className={styles.historyDrawer}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>💬 Chat History</span>
                    <button
                      className={styles.historyClose}
                      onClick={() => setShowChatHistory(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {chatHistory.length === 0 ? (
                    <div className={styles.historyEmpty}>
                      No saved sessions yet. Chat sessions are saved when you clear or start a new conversation.
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {chatHistory.map((session) => (
                        <div key={session.id} className={styles.historyItem}>
                          <button
                            className={styles.historyItemBtn}
                            onClick={() => restoreChatSession(session)}
                            title={`Restore: ${session.title}`}
                          >
                            <span className={styles.historyItemTitle}>{session.title}</span>
                            <span className={styles.historyItemMeta}>
                              {session.messages.filter((m) => m.role === 'user').length} messages · {formatTimestamp(session.timestamp)}
                            </span>
                          </button>
                          <button
                            className={styles.historyDeleteBtn}
                            onClick={() => deleteChatSession(session.id)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.messages}>
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${styles.bubble} ${
                      msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot
                    }`}
                  >
                    <span className={styles.bubbleLabel}>
                      {msg.role === 'user'
                        ? 'You'
                        : msg.tier === 'premium'
                        ? 'iX Bot ✨'
                        : 'iX Bot'}
                    </span>
                    <p className={styles.bubbleText}>{msg.text}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className={styles.sourcesRow}>
                        <span className={styles.sourcesLabel}>📖 Sources:</span>
                        {msg.sources.map((src, si) => (
                          <a
                            key={si}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.sourceLink}
                            title={src.title}
                          >
                            {src.title.length > 30 ? src.title.slice(0, 30) + '…' : src.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className={`${styles.bubble} ${styles.bubbleBot}`}>
                    <span className={styles.bubbleLabel}>iX Bot ✨</span>
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
              {/* Code Gen History Drawer (overlay) */}
              {showCodeGenHistory && (
                <div className={styles.historyDrawer}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>&lt;/&gt; Code Gen History</span>
                    <button
                      className={styles.historyClose}
                      onClick={() => setShowCodeGenHistory(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {codeGenHistory.length === 0 ? (
                    <div className={styles.historyEmpty}>
                      No saved generations yet. Code sessions are saved when you clear or start a new generation.
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {codeGenHistory.map((session) => (
                        <div key={session.id} className={styles.historyItem}>
                          <button
                            className={styles.historyItemBtn}
                            onClick={() => restoreCodeGenSession(session)}
                            title={`Restore: ${session.title}`}
                          >
                            <span className={styles.historyItemTitle}>{session.title}</span>
                            <span className={styles.historyItemMeta}>
                              {FRAMEWORK_LABELS[session.framework]} · {formatTimestamp(session.timestamp)}
                            </span>
                          </button>
                          <button
                            className={styles.historyDeleteBtn}
                            onClick={() => deleteCodeGenSession(session.id)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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

              {/* Info message (includes gate message when no key) */}
              {codeMessage && (
                <div className={styles.info}>
                  {codeMessage}
                  {!hasPremium && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className={styles.settingsLinkBtn}
                        onClick={() => setMode('settings')}
                      >
                        ⚙️ Go to Settings →
                      </button>
                    </div>
                  )}
                </div>
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
                        title={`Keywords: ${(comp.matchedKeywords || []).join(', ')}`}
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

          {/* ─────── Settings View ─────── */}
          {mode === 'settings' && (
            <div className={styles.settingsBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>🔑 API Key</h3>
                <p className={styles.settingsDescription}>
                  iX AI Assistant is open-source. To keep it free for everyone, AI features
                  use <strong>your own AI API key</strong>. Many providers (Groq, OpenAI,
                  Mistral, etc.) offer free tiers — no credit card needed.
                </p>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.settingsLink}
                >
                  ↗ Get a free Groq key (recommended — no credit card)
                </a>
              </div>

              <div className={styles.settingsSection}>
                <label className={styles.label}>
                  {keyLoading
                    ? 'Loading…'
                    : hasPremium
                    ? '✅ AI API Key (saved & encrypted)'
                    : 'Enter your AI API key'}
                </label>

                {keyLoading && (
                  <div className={styles.keyLoading}>
                    <span className={styles.spinner} /> Decrypting stored key…
                  </div>
                )}

                {!keyLoading && hasPremium && (
                  <div className={styles.keyStatus}>
                    <div className={styles.keyMasked}>
                      {apiKey.slice(0, 6)}{'•'.repeat(20)}{apiKey.slice(-4)}
                    </div>
                    <button className={styles.clearKeyBtn} onClick={clearApiKey}>
                      Remove key
                    </button>
                  </div>
                )}

                {!keyLoading && !hasPremium && (
                  <>
                    <input
                      className={styles.keyInput}
                      type="password"
                      placeholder="sk-••••••••••••••••••••••••••••••••••••"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className={styles.saveKeyBtn}
                      onClick={saveApiKey}
                      disabled={!apiKeyInput.trim()}
                    >
                      Save Key
                    </button>
                  </>
                )}

                {apiKeySaved && (
                  <div className={styles.savedBadge}>✓ Key saved! AI features are now unlocked.</div>
                )}
              </div>

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>🆓 Free vs Premium</h3>
                <table className={styles.tierTable}>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Free</th>
                      <th>With Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>iX FAQ answers</td><td>✅</td><td>✅</td></tr>
                    <tr><td>Component lookup</td><td>✅</td><td>✅</td></tr>
                    <tr><td>AI chat (LLM)</td><td>—</td><td>✅</td></tr>
                    <tr><td>Code generation</td><td>—</td><td>✅</td></tr>
                  </tbody>
                </table>
                <p className={styles.settingsNote}>
                  🔒 Your key is <strong>AES-256-GCM encrypted</strong> before being saved to
                  localStorage — it is never stored as plain text. The key is only sent to
                  the AI provider's API, never to any other server.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
