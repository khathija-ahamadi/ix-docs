import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';

const BACKEND_URL = 'http://localhost:5000/chat';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: '👋 Hello! Ask me anything about the Siemens iX design system — components, installation, theming, guidelines and more.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!question.trim() || loading) return;
    const userMsg = question.trim();
    setQuestion('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'bot', text: data.answer }]);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  const clearChat = () => {
    setMessages([
      { role: 'bot', text: 'Chat cleared. Ask me anything about Siemens iX!' },
    ]);
    setError('');
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        className={styles.fab}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        title="iX Chatbot"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.headerTitle}>iX Chatbot</span>
            <button className={styles.clearBtn} onClick={clearChat} title="Clear chat">
              🗑
            </button>
          </div>

          {/* Messages */}
          <div className={styles.messages}>
            {messages.map((msg, i) => (
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

            {loading && (
              <div className={`${styles.bubble} ${styles.bubbleBot}`}>
                <span className={styles.bubbleLabel}>iX Bot</span>
                <span className={styles.typing}>Thinking…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {error && (
            <div className={styles.error}>
              ⚠️ {error}
              <button className={styles.errorClose} onClick={() => setError('')}>
                ✕
              </button>
            </div>
          )}

          {/* Input row */}
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder="Ask about Siemens iX..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className={styles.sendBtn}
              onClick={sendMessage}
              disabled={loading || !question.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}