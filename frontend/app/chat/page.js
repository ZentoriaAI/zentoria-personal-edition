'use client';

import { useState, useRef, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.220.242/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch(`${API_URL}/v1/mcp/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({ command: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          model: data.model
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'error',
          content: data.error?.message || 'Failed to get response'
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: error.message || 'Network error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="sidebar">
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f97316' }}>Zentoria PE</h1>
          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>AI Control Plane</p>
        </div>
        <nav>
          <a href="/" className="nav-item">Dashboard</a>
          <a href="/chat" className="nav-item" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>Chat</a>
          <a href="/files" className="nav-item">Files</a>
          <a href="/workflows" className="nav-item">Workflows</a>
          <a href="/keys" className="nav-item">API Keys</a>
          <a href="/settings" className="nav-item">Settings</a>
        </nav>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Header */}
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #1e1e2e' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>AI Chat</h2>
          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Powered by Ollama (llama3.2:3b)</p>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '4rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💬</div>
              <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Start a conversation</p>
              <p style={{ fontSize: '0.875rem' }}>Ask me anything - I can help with code, questions, and more!</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  background: msg.role === 'user'
                    ? '#f97316'
                    : msg.role === 'error'
                      ? '#dc2626'
                      : '#1e1e2e',
                  color: 'white',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
                {msg.model && (
                  <div style={{ fontSize: '0.625rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                    {msg.model}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1rem' }}>
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                background: '#1e1e2e',
                color: '#9ca3af'
              }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} style={{ padding: '1rem 2rem', borderTop: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #1e1e2e',
                background: '#0a0a12',
                color: 'white',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: isLoading || !input.trim() ? '#374151' : '#f97316',
                color: 'white',
                fontWeight: '600',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </button>
          </div>
        </form>
      </main>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
