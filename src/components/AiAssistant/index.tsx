import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';

const CHAT_URL = 'http://localhost:5000/chat';
const GENERATE_URL = 'http://localhost:5000/generate';
const API_KEY_STORAGE = 'ix-assistant-api-key';
const CHAT_HISTORY_STORAGE = 'ix-assistant-chat-history';
const CODEGEN_HISTORY_STORAGE = 'ix-assistant-codegen-history';
const MAX_HISTORY = 10;
const REFINE_URL = 'http://localhost:5000/refine';
const MIGRATE_URL = 'http://localhost:5000/migrate';
const DEPRECATION_CHECK_URL = 'http://localhost:5000/deprecation-check';
const LANG_STORAGE = 'ix-assistant-lang';

// ── Multi-language support ──────────────────────────────────────────────────
type Language = 'en' | 'de' | 'zh' | 'fr' | 'es' | 'ja' | 'pt' | 'ko';

const LANGUAGE_LABELS: Record<Language, string> = {
  en: '🇬🇧 English',
  de: '🇩🇪 Deutsch',
  zh: '🇨🇳 中文',
  fr: '🇫🇷 Français',
  es: '🇪🇸 Español',
  ja: '🇯🇵 日本語',
  pt: '🇵🇹 Português',
  ko: '🇰🇷 한국어',
};

// ── Deprecated iX component registry (for proactive hints) ──────────────
const DEPRECATED_PATTERNS = [
  'ix-datetime-picker', 'IxDatetimePicker',
  'ix-time-picker', 'IxTimePicker',
  'ix-date-picker', 'IxDatePicker',
  'ix-input-group', 'IxInputGroup',
  'ix-breadcrumb-next', 'IxBreadcrumbNext',
];

// ── IX Component registry (for Visual Component Picker) ───────────────────
const IX_COMPONENTS = [
  'ix-application', 'ix-application-header', 'ix-menu', 'ix-menu-item',
  'ix-menu-category', 'ix-menu-settings', 'ix-menu-about', 'ix-menu-about-item',
  'ix-menu-about-news', 'ix-menu-avatar', 'ix-menu-avatar-item', 'ix-menu-settings-item',
  'ix-avatar', 'ix-icon', 'ix-icon-button', 'ix-icon-toggle-button',
  'ix-content', 'ix-content-header', 'ix-button', 'ix-link-button',
  'ix-toggle-button', 'ix-split-button', 'ix-dropdown-button', 'ix-dropdown',
  'ix-dropdown-item', 'ix-dropdown-header', 'ix-dropdown-quick-actions',
  'ix-input', 'ix-number-input', 'ix-date-input', 'ix-time-input',
  'ix-textarea', 'ix-select', 'ix-select-item', 'ix-checkbox', 'ix-checkbox-group',
  'ix-radio', 'ix-radio-group', 'ix-toggle', 'ix-slider',
  'ix-date-picker', 'ix-time-picker', 'ix-datetime-picker', 'ix-date-dropdown',
  'ix-card', 'ix-card-content', 'ix-card-list', 'ix-push-card', 'ix-action-card',
  'ix-blind', 'ix-chip', 'ix-pill', 'ix-spinner', 'ix-divider', 'ix-typography',
  'ix-breadcrumb', 'ix-breadcrumb-item', 'ix-pagination',
  'ix-tabs', 'ix-tab-item', 'ix-category-filter', 'ix-expanding-search',
  'ix-event-list', 'ix-event-list-item', 'ix-key-value', 'ix-key-value-list',
  'ix-kpi', 'ix-tile', 'ix-flip-tile', 'ix-flip-tile-content',
  'ix-group', 'ix-group-item', 'ix-tree', 'ix-empty-state',
  'ix-modal-header', 'ix-modal-content', 'ix-modal-footer',
  'ix-pane', 'ix-pane-layout', 'ix-drawer',
  'ix-message-bar', 'ix-toast-container', 'ix-tooltip',
  'ix-progress-indicator', 'ix-layout-auto', 'ix-layout-grid', 'ix-row', 'ix-col',
  'ix-field-label', 'ix-custom-field', 'ix-upload',
  'ix-workflow-steps', 'ix-workflow-step',
];

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

type Mode = 'chat' | 'codegen' | 'settings' | 'migrate' | 'help' | 'analytics';
type Framework = 'react' | 'angular' | 'angular-standalone' | 'vue' | 'webcomponents';

interface Source {
  title: string;
  url: string;
  deprecated?: boolean;
}

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  tier?: 'free' | 'premium';
  sources?: Source[];
  hasDeprecationWarnings?: boolean;
}

interface MatchedComponent {
  title: string;
  score: number;
  url?: string;
  deprecated?: boolean;
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
  'angular-standalone': 'Angular SA',
  vue: 'Vue',
  webcomponents: 'Web Components',
};

const EXAMPLE_PROMPTS = [
  'Create a login page with username input, password input, login button, and remember me checkbox',
  'Build a dashboard with a content header, two KPI cards, and a line chart',
  'Create a settings page with a form containing toggle switches, a select dropdown, and save/cancel buttons',
  'Build a data table page with pagination, a search bar, and action buttons for add/edit/delete',
  'Show me how to migrate from a deprecated component to its replacement',
  'Build a notification center using messagebar with dismiss and action buttons',
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

// ────────────────────────────────────────────────────────────────────────────
// Usage Analytics View
// Fetches live data from GET /analytics and renders top questions + counts.
// ────────────────────────────────────────────────────────────────────────────
function AnalyticsView() {
  const [data, setData] = useState<{
    endpointCounts: Record<string, number>;
    totalTracked: number;
    topQueries: { text: string; count: number }[];
    recentQueries: { text: string; timestamp: number; endpoint: string; lang: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/analytics')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div className={styles.settingsBody}>
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsTitle}>📊 Usage Analytics</h3>
        <p className={styles.settingsDescription}>
          Track common questions to improve documentation and product guidance. Data is in-memory and resets on server restart.
        </p>
      </div>

      {loading && <div className={styles.settingsDescription} style={{ padding: '0 16px' }}>Loading…</div>}
      {error && <div className={styles.error} style={{ margin: '0 16px' }}>⚠️ Could not load analytics: {error}</div>}

      {data && (
        <>
          {/* Endpoint counts */}
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsTitle}>Queries by Feature</h3>
            <table className={styles.tierTable}>
              <thead><tr><th>Feature</th><th>Queries</th></tr></thead>
              <tbody>
                {Object.entries(data.endpointCounts).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top questions */}
          {data.topQueries.length > 0 && (
            <div className={styles.settingsSection}>
              <h3 className={styles.settingsTitle}>Top Questions</h3>
              <div className={styles.analyticsQueryList}>
                {data.topQueries.map((q, i) => (
                  <div key={i} className={styles.analyticsQueryItem}>
                    <span className={styles.analyticsQueryText}>{q.text}</span>
                    <span className={styles.analyticsQueryCount}>×{q.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent queries */}
          {data.recentQueries.length > 0 && (
            <div className={styles.settingsSection}>
              <h3 className={styles.settingsTitle}>Recent Queries</h3>
              <div className={styles.analyticsQueryList}>
                {data.recentQueries.map((q, i) => (
                  <div key={i} className={styles.analyticsQueryItem}>
                    <span className={styles.analyticsQueryText}>{q.text}</span>
                    <span className={styles.analyticsQueryMeta}>
                      {q.endpoint} · {q.lang} · {new Date(q.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.topQueries.length === 0 && data.recentQueries.length === 0 && (
            <div className={styles.settingsDescription} style={{ padding: '0 16px 16px' }}>
              No queries tracked yet. Use Chat or Code Gen to generate data.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');

  // ── Resize state ──
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  // Lazy init: compute once at mount so window is defined (avoids SSR crash)
  const initialHeightRef = useRef<number | null>(null);
  if (initialHeightRef.current === null) {
    initialHeightRef.current =
      typeof window !== 'undefined'
        ? Math.round(window.innerHeight * (DEFAULT_HEIGHT_VH / 100))
        : 600;
  }
  const [panelHeight, setPanelHeight] = useState(initialHeightRef.current);

  // Initial dimensions are the minimum – users can only resize larger
  const MIN_WIDTH = DEFAULT_WIDTH;
  const MIN_HEIGHT = initialHeightRef.current;
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

  // ── Active session ID refs (prevent duplicates when saving) ──
  const activeChatSessionIdRef = useRef<string | null>(null);
  const activeCodeGenSessionIdRef = useRef<string | null>(null);

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
      text: '👋 Hello! Ask me anything about the Siemens iX design system — components, installation, theming, guidelines, migration and more.\n\n⚠️ I can also warn you about deprecated APIs and suggest the correct replacements.',
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

  // ── Conversational Refine state ──
  const [refineInput, setRefineInput] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);

  // ── Image-to-Code state ──
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Code File Upload state ──
  const [codeFileContent, setCodeFileContent] = useState<string | null>(null);
  const [codeFileName, setCodeFileName] = useState('');
  const codeFileInputRef = useRef<HTMLInputElement>(null);

  // ── Visual Component Picker state ──
  const [showCompPicker, setShowCompPicker] = useState(false);
  const [compSearch, setCompSearch] = useState('');

  // ── Migration Wizard state ──
  const [migrateInput, setMigrateInput] = useState('');
  const [migrateOutput, setMigrateOutput] = useState('');
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateError, setMigrateError] = useState('');
  const [migrateSummary, setMigrateSummary] = useState('');

  // ── Language state ──
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(LANG_STORAGE) as Language) || 'en';
    }
    return 'en';
  });

  // ── Voice input state ──
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── Proactive deprecation hint state ──
  const [deprecationHint, setDeprecationHint] = useState('');

  // ── More-menu (overflow tabs) state ──
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── Persist language preference ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANG_STORAGE, lang);
    }
  }, [lang]);

  // ── Voice input: toggle listening ──
  const toggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setChatError('Voice input is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang === 'zh' ? 'zh-CN' :
                       lang === 'ja' ? 'ja-JP' :
                       lang === 'ko' ? 'ko-KR' :
                       lang === 'de' ? 'de-DE' :
                       lang === 'fr' ? 'fr-FR' :
                       lang === 'es' ? 'es-ES' :
                       lang === 'pt' ? 'pt-PT' : 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      setQuestion(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); setChatError('Voice recognition error. Please try again.'); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ── Proactive deprecation hint ──
  // Runs when the user pauses typing in the chat input (300 ms debounce).
  useEffect(() => {
    if (!question.trim()) { setDeprecationHint(''); return; }
    const detected = DEPRECATED_PATTERNS.filter((p) =>
      question.toLowerCase().includes(p.toLowerCase())
    );
    if (detected.length === 0) { setDeprecationHint(''); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(DEPRECATION_CHECK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ components: detected }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.alerts?.length > 0) {
            const names = data.alerts.map((a: any) => a.component).join(', ');
            setDeprecationHint(`⚠️ Deprecated API detected: ${names}. The bot will suggest the correct replacement.`);
          } else {
            setDeprecationHint('');
          }
        }
      } catch { /* non-blocking */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [question]);

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

  // ── Escape key closes panel (or more-menu first) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMoreMenu) { setShowMoreMenu(false); }
        else if (isOpen) setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showMoreMenu]);

  // ── Click-outside closes more menu ──
  useEffect(() => {
    if (!showMoreMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-more-menu]')) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showMoreMenu]);

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

    // New user message means any restored session is now modified — give it a fresh id on next save
    activeChatSessionIdRef.current = null;
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
        body: JSON.stringify({ question: userMsg, apiKey, history: recentHistory, lang }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: data.answer,
          tier: 'premium',
          sources: data.sources || [],
          hasDeprecationWarnings: data.hasDeprecationWarnings || false,
        },
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

    const id = activeChatSessionIdRef.current ?? Date.now().toString();
    activeChatSessionIdRef.current = id;

    const session: ChatSession = {
      id,
      title: deriveSessionTitle(chatMessages),
      timestamp: Date.now(),
      messages: chatMessages,
    };
    // Replace existing entry with same id (avoids duplicates on restore/clear cycles)
    const filtered = chatHistory.filter((s) => s.id !== id);
    const updated = [session, ...filtered].slice(0, MAX_HISTORY);
    setChatHistory(updated);
    saveChatHistory(updated);
  };

  const clearChat = () => {
    saveChatSession();
    activeChatSessionIdRef.current = null; // next session gets a fresh id
    setChatMessages([
      { role: 'bot', text: 'Chat cleared. Ask me anything about Siemens iX!' },
    ]);
    setChatError('');
  };

  const restoreChatSession = (session: ChatSession) => {
    // Save current before restoring (replaces in-place if already tracked)
    saveChatSession();
    activeChatSessionIdRef.current = session.id;
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

    // Auto-save previous generation before starting a new one, then reset so
    // the new generation gets a fresh history id (prevents duplicates)
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = null;

    try {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          framework,
          apiKey,
          lang,
          ...(uploadedImage ? { screenshot: uploadedImage } : {}),
          ...(codeFileContent ? { fileContent: codeFileContent, fileName: codeFileName } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.code) {
        setGeneratedCode(data.code);
        setMatchedComponents(data.matchedComponents || []);
        if (data.hasDeprecationWarnings) {
          setCodeMessage(
            '⚠️ Some matched components contain deprecation notices. Review the generated code comments carefully and check the migration guide.'
          );
        }
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
    const id = activeCodeGenSessionIdRef.current ?? Date.now().toString();
    activeCodeGenSessionIdRef.current = id;
    const session: CodeGenSession = {
      id,
      title: description.length > 50 ? description.slice(0, 50) + '…' : description,
      timestamp: Date.now(),
      description,
      framework,
      code: generatedCode,
      matchedComponents,
    };
    // Replace existing entry with same id (avoids duplicates on restore/clear cycles)
    const filtered = codeGenHistory.filter((s) => s.id !== id);
    const updated = [session, ...filtered].slice(0, MAX_HISTORY);
    setCodeGenHistory(updated);
    saveCodeGenHistory(updated);
  };

  const clearCodeGen = () => {
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = null; // next session gets a fresh id
    setDescription('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeError('');
    setCodeMessage('');
    setCodeFileContent(null);
    setCodeFileName('');
    textareaRef.current?.focus();
  };

  const restoreCodeGenSession = (session: CodeGenSession) => {
    // Save current before restoring (replaces in-place if already tracked)
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = session.id;
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
  //  FEATURE 2 — OPEN IN STACKBLITZ
  // ════════════════════════════════════════════════════════════
  const openInStackBlitz = () => {
    const clean = generatedCode
      .replace(/^```[\w-]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();
    const fileNames: Record<Framework, string> = {
      react: 'src/App.tsx',
      angular: 'src/app/app.component.ts',
      'angular-standalone': 'src/app/app.component.ts',
      vue: 'src/App.vue',
      webcomponents: 'index.html',
    };
    const templates: Record<Framework, string> = {
      react: 'node',
      angular: 'node',
      'angular-standalone': 'node',
      vue: 'node',
      webcomponents: 'javascript',
    };
    const mainFile = fileNames[framework];
    const form = document.createElement('form');
    form.setAttribute('method', 'POST');
    form.setAttribute('action', `https://stackblitz.com/run?file=${encodeURIComponent(mainFile)}`);
    form.setAttribute('target', '_blank');
    const add = (name: string, value: string) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = name; inp.value = value;
      form.appendChild(inp);
    };
    add('project[title]', 'iX AI Generated App');
    add('project[description]', 'Generated by Siemens iX AI Assistant');
    add('project[template]', templates[framework]);
    add(`project[files][${mainFile}]`, clean);
    if (framework !== 'webcomponents') {
      add('project[files][package.json]', JSON.stringify({
        name: 'ix-ai-generated',
        version: '1.0.0',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { '@siemens/ix': 'latest', '@siemens/ix-icons': 'latest' },
      }, null, 2));
    }
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 1 — CONVERSATIONAL CODE REFINEMENT
  // ════════════════════════════════════════════════════════════
  const handleRefine = async () => {
    if (!refineInput.trim() || refineLoading || !generatedCode) return;
    if (!hasPremium) {
      setCodeMessage('🔑 Code refinement requires an API key — add one in ⚙️ Settings.');
      return;
    }
    setRefineLoading(true);
    setCodeError('');
    const instruction = refineInput.trim();
    setRefineInput('');
    try {
      const res = await fetch(REFINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: generatedCode, instruction, framework, apiKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.code) setGeneratedCode(data.code);
    } catch (err: any) {
      setCodeError(err.message || 'Refinement failed');
    } finally {
      setRefineLoading(false);
    }
  };

  const handleRefineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) handleRefine();
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 4 — IMAGE-TO-CODE (Screenshot → Code)
  // ════════════════════════════════════════════════════════════
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearUploadedImage = () => {
    setUploadedImage(null);
    setImageFileName('');
  };

  const handleCodeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCodeFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCodeFileContent(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearCodeFile = () => {
    setCodeFileContent(null);
    setCodeFileName('');
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 5 — DEPRECATION MIGRATION WIZARD
  // ════════════════════════════════════════════════════════════
  const handleMigrate = async () => {
    if (!migrateInput.trim() || migrateLoading) return;
    if (!hasPremium) {
      setMigrateError('🔑 Migration analysis requires an API key — add one in ⚙️ Settings.');
      return;
    }
    setMigrateLoading(true);
    setMigrateError('');
    setMigrateOutput('');
    setMigrateSummary('');
    try {
      const res = await fetch(MIGRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: migrateInput, apiKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setMigrateOutput(data.migratedCode || '');
      setMigrateSummary(data.summary || '');
    } catch (err: any) {
      setMigrateError(err.message || 'Migration analysis failed');
    } finally {
      setMigrateLoading(false);
    }
  };

  const handleMigrateCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  /** Simple line-level diff renderer between old and migrated code */
  const computeDiff = (oldCode: string, newCode: string) => {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.replace(/^```[\w-]*\n?/gm, '').replace(/```$/gm, '').trim().split('\n');
    const result: { text: string; type: 'removed' | 'added' | 'unchanged' }[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === undefined) {
        result.push({ text: n, type: 'added' });
      } else if (n === undefined) {
        result.push({ text: o, type: 'removed' });
      } else if (o === n) {
        result.push({ text: o, type: 'unchanged' });
      } else {
        result.push({ text: o, type: 'removed' });
        result.push({ text: n, type: 'added' });
      }
    }
    return result;
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
          {(() => {
            // All overflow items with their labels
            const MORE_ITEMS: { id: Mode; label: string }[] = [
              { id: 'migrate',   label: '🔀 Migrate'   },
              { id: 'analytics', label: '📊 Analytics' },
              { id: 'settings',  label: '⚙️ Settings'  },
              { id: 'help',      label: '❓ Help'      },
            ];
            // If the active mode is an overflow item, float it up as a visible tab.
            const promotedItem = MORE_ITEMS.find((m) => m.id === mode) ?? null;
            // Remaining items stay in the dropdown.
            const dropdownItems = MORE_ITEMS.filter((m) => m.id !== mode);
            const switchMode = (m: Mode) => {
              setMode(m);
              setShowChatHistory(false);
              setShowCodeGenHistory(false);
              setShowMoreMenu(false);
            };
            return (
              <div className={styles.header}>
                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${mode === 'chat' ? styles.tabActive : ''}`}
                    onClick={() => switchMode('chat')}
                  >
                    💬 Chat
                  </button>
                  <button
                    className={`${styles.tab} ${mode === 'codegen' ? styles.tabActive : ''}`}
                    onClick={() => switchMode('codegen')}
                  >
                    &lt;/&gt; Code Gen
                  </button>

                  {/* Promoted "more" tab — shown when an overflow mode is active */}
                  {promotedItem && (
                    <button
                      className={`${styles.tab} ${styles.tabActive} ${styles.tabPromoted}`}
                      onClick={() => switchMode(promotedItem.id)}
                    >
                      {promotedItem.label}
                    </button>
                  )}

                  {/* ── ··· More dropdown ── */}
                  <div className={styles.moreMenuWrapper} data-more-menu>
                    <button
                      className={`${styles.tab} ${styles.moreBtn} ${showMoreMenu ? styles.moreBtnOpen : ''}`}
                      onClick={() => setShowMoreMenu((v) => !v)}
                      title="More options"
                    >
                      ··· More
                    </button>
                    {showMoreMenu && (
                      <div className={styles.moreMenu}>
                        {dropdownItems.map((item) => (
                          <button
                            key={item.id}
                            className={styles.moreMenuItem}
                            onClick={() => switchMode(item.id)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
            <div className={styles.headerActions}>
              {mode !== 'settings' && mode !== 'migrate' && mode !== 'help' && mode !== 'analytics' && (
                <>
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
                </>
              )}
            </div>
          </div>
            );
          })()}

          {/* ─────── Tier banner ─────── */}
          {mode !== 'settings' && mode !== 'migrate' && mode !== 'help' && mode !== 'analytics' && !keyLoading && (
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
                    {/* Deprecation warning banner */}
                    {msg.role === 'bot' && msg.hasDeprecationWarnings && (
                      <div className={styles.deprecationBanner}>
                        ⚠️ This response mentions deprecated APIs or breaking changes. Check migration docs.
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className={styles.sourcesRow}>
                        <span className={styles.sourcesLabel}>📖 Sources:</span>
                        {msg.sources.map((src, si) => (
                          <a
                            key={si}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${styles.sourceLink} ${src.deprecated ? styles.sourceLinkDeprecated : ''}`}
                            title={src.deprecated ? `⚠️ Deprecated — ${src.title}` : src.title}
                          >
                            {src.deprecated ? '⚠️ ' : ''}{src.title.length > 30 ? src.title.slice(0, 30) + '…' : src.title}
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

              {deprecationHint && (
                <div className={styles.deprecationHint}>
                  {deprecationHint}
                </div>
              )}
              <div className={styles.inputRow}>
                <button
                  className={`${styles.micBtn} ${isListening ? styles.micBtnActive : ''}`}
                  onClick={toggleVoice}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                  aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                >
                  {isListening ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M2 8a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="8" y1="14" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                <input
                  ref={chatInputRef}
                  className={styles.input}
                  type="text"
                  placeholder={isListening ? 'Listening…' : 'Ask about Siemens iX...'}
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

              {/* ── Upload tools: Screenshot → Code + Code File ─────────── */}
              <div className={styles.uploadGrid}>
                {/* Screenshot slot */}
                <div className={styles.uploadSlot}>
                  <span className={styles.uploadSlotLabel}>📷 Screenshot</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                  {!uploadedImage ? (
                    <button
                      className={styles.uploadSlotBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={codeLoading}
                      title="Upload a UI screenshot to generate code from it (requires API key)"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M1 12V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.2"/>
                        <circle cx="5.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M1 10l3.5-3 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                      Upload image
                    </button>
                  ) : (
                    <div className={styles.uploadSlotPreview}>
                      <img src={uploadedImage} alt={imageFileName} className={styles.uploadSlotThumb} />
                      <div className={styles.uploadSlotMeta}>
                        <span className={styles.uploadSlotName}>{imageFileName}</span>
                        <button className={styles.uploadSlotClear} onClick={clearUploadedImage} title="Remove screenshot">✕ Remove</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Code file slot */}
                <div className={styles.uploadSlot}>
                  <span className={styles.uploadSlotLabel}>📄 Code File</span>
                  <input
                    ref={codeFileInputRef}
                    type="file"
                    accept=".html,.htm,.tsx,.ts,.jsx,.js,.css,.scss,.vue,.json,.md,.txt"
                    style={{ display: 'none' }}
                    onChange={handleCodeFileUpload}
                  />
                  {!codeFileContent ? (
                    <button
                      className={styles.uploadSlotBtn}
                      onClick={() => codeFileInputRef.current?.click()}
                      disabled={codeLoading}
                      title="Upload an existing code file to refactor or extend it with iX components"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M6 8h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      Upload file
                    </button>
                  ) : (
                    <div className={styles.uploadSlotPreview}>
                      <div className={styles.uploadSlotFileIcon}>
                        {codeFileName.split('.').pop()?.toUpperCase() || 'FILE'}
                      </div>
                      <div className={styles.uploadSlotMeta}>
                        <span className={styles.uploadSlotName}>{codeFileName}</span>
                        <span className={styles.uploadSlotSize}>{codeFileContent.length.toLocaleString()} chars</span>
                        <button className={styles.uploadSlotClear} onClick={clearCodeFile} title="Remove file">✕ Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

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

              {/* ── Feature 3: Visual Component Picker ──────────────────────── */}
              <div className={styles.section}>
                <div className={styles.compPickerHeader}>
                  <label className={styles.label}>📦 Component Picker</label>
                  <button
                    className={styles.compPickerToggle}
                    onClick={() => { setShowCompPicker(v => !v); setCompSearch(''); }}
                  >
                    {showCompPicker ? 'Hide' : 'Browse & add ▾'}
                  </button>
                </div>
                {showCompPicker && (
                  <div className={styles.compPickerBox}>
                    <input
                      className={styles.compPickerSearch}
                      type="text"
                      placeholder="Search components… (e.g. button, modal, input)"
                      value={compSearch}
                      onChange={(e) => setCompSearch(e.target.value)}
                      autoFocus
                    />
                    <div className={styles.compPickerGrid}>
                      {IX_COMPONENTS
                        .filter(c => !compSearch || c.includes(compSearch.toLowerCase().trim()))
                        .map(comp => (
                          <button
                            key={comp}
                            className={styles.compPickerChip}
                            onClick={() => {
                              setDescription(prev =>
                                prev ? `${prev.trimEnd()}, use ${comp}` : `Use ${comp}`
                              );
                              textareaRef.current?.focus();
                            }}
                            title={`Add ${comp} to prompt`}
                          >
                            {comp.replace('ix-', '')}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

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
                        className={`${styles.chip} ${comp.deprecated ? styles.chipDeprecated : ''}`}
                        title={comp.deprecated
                          ? `⚠️ Deprecated — Keywords: ${(comp.matchedKeywords || []).join(', ')}`
                          : `Keywords: ${(comp.matchedKeywords || []).join(', ')}`}
                      >
                        {comp.deprecated ? '⚠️ ' : ''}{comp.title}
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
                    <div className={styles.codeActions}>
                      <button
                        className={styles.stackblitzBtn}
                        onClick={openInStackBlitz}
                        disabled={codeLoading}
                        title="Open in StackBlitz live sandbox"
                      >
                        <svg width="13" height="13" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M12 2L2 14h9l-3 12 17-14h-9l3-10z" fill="currentColor"/>
                        </svg>
                        StackBlitz
                      </button>
                      <button
                        className={styles.regenerateBtn}
                        onClick={handleGenerate}
                        disabled={codeLoading}
                        title="Regenerate code"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M13.65 2.35A8 8 0 1 0 15 8h-2a6 6 0 1 1-1.05-3.39L9.5 7H15V1.5l-1.35.85z" fill="currentColor"/>
                        </svg>
                        Regenerate
                      </button>
                      <button className={styles.copyBtn} onClick={handleCopy} title={copied ? 'Copied!' : 'Copy code'}>
                        {copied ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <rect x="5" y="1" width="9" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                              <rect x="2" y="4" width="9" height="11" rx="2" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
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

              {/* ── Feature 1: Conversational Code Refinement ───────────────── */}
              {generatedCode && (
                <div className={styles.refineRow}>
                  <input
                    className={styles.refineInput}
                    type="text"
                    placeholder='Refine: e.g. “make the button secondary” or “add a loading state”…'
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={handleRefineKeyDown}
                    disabled={refineLoading}
                  />
                  <button
                    className={styles.refineBtn}
                    onClick={handleRefine}
                    disabled={refineLoading || !refineInput.trim()}
                    title="Refine the generated code with a natural language instruction"
                  >
                    {refineLoading ? <span className={styles.spinner} /> : '\u2728'} Refine
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─────── Settings View ─────── */}
          {mode === 'settings' && (
            <div className={styles.settingsBody}>
              {/* ─── Language selector ─── */}
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>🌍 Response Language</h3>
                <p className={styles.settingsDescription}>
                  The AI will respond in the selected language. Code examples always remain in their original language.
                </p>
                <div className={styles.langRow}>
                  {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([code, label]) => (
                    <button
                      key={code}
                      className={`${styles.langBtn} ${lang === code ? styles.langBtnActive : ''}`}
                      onClick={() => setLang(code)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>🔑 API Key</h3>
                <p className={styles.settingsDescription}>
                  iX AI Assistant uses the <strong>Siemens LLM API</strong> (code.siemens.com).
                  Generate your personal API key on <strong>my.siemens.com</strong> — available
                  to every Siemens employee, no credit card needed.
                </p>
                <a
                  href="https://my.siemens.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.settingsLink}
                >
                  ↗ Get your Siemens LLM API key (my.siemens.com → My Keys → Create, scope: llm)
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
                      placeholder="SIAK-••••••••••••••••••••••••••••••••••"
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

          {/* ─────── Help View ─────── */}
          {mode === 'help' && (
            <div className={styles.settingsBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>Help</h3>
                <div className={styles.helpLinks}>
                  <a
                    href="https://ix.siemens.io/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="5.5" y1="5.5" x2="10.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5.5" y1="8" x2="10.5" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5.5" y1="10.5" x2="8.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    Go to docs
                  </a>
                  <a
                    href="https://github.com/siemens/ix/discussions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5s1.5.67 1.5 1.5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                    </svg>
                    Go to support forums
                  </a>
                  <a
                    href="https://support.industry.siemens.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5s1.5.67 1.5 1.5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                    </svg>
                    Contact support
                  </a>
                  <a
                    href="https://www.siemens.com/global/en/company/contact.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7A1.5 1.5 0 0112.5 12H5l-3 2.5V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                    Contact sales
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ─────── Analytics View ─────── */}
          {mode === 'analytics' && (
            <AnalyticsView />
          )}

          {/* ─────── Migration Wizard View ─────── */}
          {mode === 'migrate' && (
            <div className={styles.migrateBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>🔀 Deprecation Migration Wizard</h3>
                <p className={styles.settingsDescription}>
                  Paste code that uses deprecated iX APIs. The wizard analyzes it and outputs
                  upgraded code with a line-by-line diff and a plain-language migration summary.
                </p>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Your existing code</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Paste code that uses deprecated iX components or APIs…"
                  value={migrateInput}
                  onChange={(e) => setMigrateInput(e.target.value)}
                  rows={7}
                  disabled={migrateLoading}
                />
              </div>

              <button
                className={styles.generateBtn}
                onClick={handleMigrate}
                disabled={migrateLoading || !migrateInput.trim()}
              >
                {migrateLoading ? <span className={styles.spinner} /> : '🔍'}{' '}
                {migrateLoading ? 'Analyzing…' : 'Analyze & Migrate'}
              </button>

              {!hasPremium && !migrateLoading && !migrateOutput && (
                <div className={styles.info}>
                  🔑 Migration requires an API key. Add one in
                  <button className={styles.settingsLinkBtn} onClick={() => setMode('settings')} style={{ marginLeft: 6 }}>
                    ⚙️ Settings →
                  </button>
                </div>
              )}

              {migrateError && (
                <div className={styles.error}>
                  ⚠️ {migrateError}
                  <button className={styles.errorClose} onClick={() => setMigrateError('')}>✕</button>
                </div>
              )}

              {migrateSummary && (
                <div className={styles.migrateSummary}>
                  <strong>📋 Summary:</strong> {migrateSummary}
                </div>
              )}

              {migrateOutput && (
                <>
                  <div className={styles.section}>
                    <label className={styles.label}>🔄 Diff (old → new)</label>
                    <div className={styles.diffBlock}>
                      {computeDiff(migrateInput, migrateOutput).map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.type === 'added'
                              ? styles.diffAdded
                              : line.type === 'removed'
                              ? styles.diffRemoved
                              : styles.diffUnchanged
                          }
                        >
                          <span className={styles.diffGutter}>
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '\u2212' : ' '}
                          </span>
                          <code>{line.text}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.codeHeader}>
                      <label className={styles.label}>Migrated Code</label>
                      <button
                        className={styles.copyBtn}
                        onClick={() => handleMigrateCopy(migrateOutput.replace(/^```[\w-]*\n?/gm, '').replace(/```$/gm, '').trim())}
                        title="Copy migrated code"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <rect x="5" y="1" width="9" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                          <rect x="2" y="4" width="9" height="11" rx="2" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        Copy
                      </button>
                    </div>
                    <pre className={styles.codeBlock}>
                      <code>{migrateOutput.replace(/^```[\w-]*\n?/gm, '').replace(/```$/gm, '').trim()}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
