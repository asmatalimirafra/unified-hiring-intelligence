import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Rag.css';
import { BASE_URL } from '../../services/api';

// const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420",
};

// ─── Rich Text Renderer ───────────────────────────────────────────────────────
const RichText = ({ text }) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            elements.push(<div key={i} className="rt-spacer" />);
            i++;
            continue;
        }

        if (line.startsWith('### ')) {
            elements.push(<h4 key={i} className="rt-h3">{parseInline(line.slice(4))}</h4>);
            i++;
            continue;
        }
        if (line.startsWith('## ')) {
            elements.push(<h3 key={i} className="rt-h2">{parseInline(line.slice(3))}</h3>);
            i++;
            continue;
        }
        if (line.startsWith('# ')) {
            elements.push(<h2 key={i} className="rt-h1">{parseInline(line.slice(2))}</h2>);
            i++;
            continue;
        }

        if (line.match(/^[*-] /)) {
            const listItems = [];
            while (i < lines.length && lines[i].match(/^[*-] /)) {
                listItems.push(<li key={i}>{parseInline(lines[i].slice(2))}</li>);
                i++;
            }
            elements.push(<ul key={`ul-${i}`} className="rt-ul">{listItems}</ul>);
            continue;
        }

        if (line.match(/^\d+\. /)) {
            const listItems = [];
            let counter = 1;
            while (i < lines.length && lines[i].match(/^\d+\. /)) {
                const content = lines[i].replace(/^\d+\. /, '');
                listItems.push(<li key={i} value={counter}>{parseInline(content)}</li>);
                counter++;
                i++;
            }
            elements.push(<ol key={`ol-${i}`} className="rt-ol">{listItems}</ol>);
            continue;
        }

        elements.push(<p key={i} className="rt-p">{parseInline(line)}</p>);
        i++;
    }

    return <div className="rich-text">{elements}</div>;
};

const parseInline = (text) => {
    const parts = [];
    const regex = /(\[(.+?)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|(https?:\/\/[^\s<>"')\]]+))/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            parts.push(text.slice(last, match.index));
        }

        if (match[0].startsWith('[')) {
            parts.push(
                <a key={match.index} href={match[3]} target="_blank" rel="noopener noreferrer" className="rt-link">
                    {match[2]}
                </a>
            );
        } else if (match[0].startsWith('**')) {
            parts.push(<strong key={match.index}>{match[4]}</strong>);
        } else if (match[0].startsWith('`')) {
            parts.push(<code key={match.index} className="rt-code">{match[5]}</code>);
        } else if (match[0].startsWith('*')) {
            parts.push(<em key={match.index}>{match[6]}</em>);
        } else if (match[7]) {
            parts.push(
                <a key={match.index} href={match[7]} target="_blank" rel="noopener noreferrer" className="rt-link">
                    {match[7]}
                </a>
            );
        }

        last = match.index + match[0].length;
    }

    if (last < text.length) {
        parts.push(text.slice(last));
    }

    return parts.length > 0 ? parts : text;
};
// ─────────────────────────────────────────────────────────────────────────────

// ── Toast Component ───────────────────────────────────────────────────────────
// Positioned inside chat-main (right side) so it doesn't overlap the dark sidebar
function Toast({ toasts }) {
    return (
        <div className="rag-toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`rag-toast rag-toast--${t.type}`}>
                    <span className="rag-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
                    <span className="rag-toast-msg">{t.msg}</span>
                </div>
            ))}
        </div>
    );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ config, onConfirm, onCancel }) {
    if (!config) return null;
    return (
        <div className="rag-confirm-overlay" onClick={onCancel}>
            <div className="rag-confirm-box" onClick={e => e.stopPropagation()}>
                <div className="rag-confirm-icon">{config.icon || '❓'}</div>
                <h4 className="rag-confirm-title">{config.title}</h4>
                <p className="rag-confirm-msg">{config.message}</p>
                <div className="rag-confirm-actions">
                    <button className="rag-confirm-btn rag-confirm-btn--cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className={`rag-confirm-btn rag-confirm-btn--ok rag-confirm-btn--${config.variant || 'danger'}`}
                        onClick={onConfirm}
                    >
                        {config.confirmLabel || 'Yes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const RagChat = () => {
    const [threads, setThreads]               = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(null);
    const [messages, setMessages]             = useState([]);
    const [input, setInput]                   = useState('');
    const [loading, setLoading]               = useState(false);

    const [renamingThreadId, setRenamingThreadId] = useState(null);
    const [renameValue, setRenameValue]           = useState('');
    const renameInputRef = useRef(null);
    const chatEndRef     = useRef(null);

    const [editingIndex, setEditingIndex] = useState(null);
    const [editValue, setEditValue]       = useState('');
    const [copiedIndex, setCopiedIndex]   = useState(null);

    const user      = JSON.parse(localStorage.getItem('user')) || {};
    const userEmail = user.email || user.user_email || "admin@company.com";

    // ── Toast state ──────────────────────────────────────────────────────────
    const [toasts, setToasts] = useState([]);

    const showToast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    };

    // ── Confirm dialog state ─────────────────────────────────────────────────
    const [confirmConfig,   setConfirmConfig]   = useState(null);
    const [confirmCallback, setConfirmCallback] = useState(null);

    const askConfirm = (config) =>
        new Promise((resolve) => {
            setConfirmConfig(config);
            setConfirmCallback(() => resolve);
        });

    const handleConfirmYes = () => {
        setConfirmConfig(null);
        confirmCallback && confirmCallback(true);
        setConfirmCallback(null);
    };

    const handleConfirmNo = () => {
        setConfirmConfig(null);
        confirmCallback && confirmCallback(false);
        setConfirmCallback(null);
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    useEffect(() => {
        if (renamingThreadId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingThreadId]);

    // ── Fetch sidebar threads ─────────────────────────────────────────────────
    const fetchThreads = useCallback(async () => {
        if (!userEmail) return;
        try {
            const res = await fetch(`${BASE_URL}/hr/threads/${userEmail}`, {
                headers: { ...NGROK_HEADERS }
            });
            const data = await res.json();
            if (Array.isArray(data)) setThreads(data);
        } catch (err) {
            console.error("❌ Failed to fetch threads:", err);
        }
    }, [userEmail]);

    useEffect(() => { fetchThreads(); }, [fetchThreads]);

    // ── Load selected thread history ──────────────────────────────────────────
    useEffect(() => {
        const loadHistory = async () => {
            if (activeThreadId && !activeThreadId.toString().startsWith('temp_')) {
                try {
                    const res = await fetch(`${BASE_URL}/hr/chat-history/${activeThreadId}`, {
                        headers: { ...NGROK_HEADERS }
                    });
                    const data = await res.json();
                    setMessages(data);
                } catch (err) {
                    console.error("❌ Failed to load history:", err);
                    showToast('Failed to load chat history.', 'error');
                }
            }
        };
        loadHistory();
    }, [activeThreadId]); // eslint-disable-line

    // ── Streaming chat handler ────────────────────────────────────────────────
    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const currentInput = input;
        const userMessage = { sender: 'user', text: currentInput };

        setMessages(prev => [...prev, userMessage, { sender: 'bot', text: '' }]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch(`${BASE_URL}/hr-chat/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...NGROK_HEADERS
                },
                body: JSON.stringify({
                    query: currentInput,
                    thread_id: activeThreadId && !activeThreadId.toString().startsWith('temp_') ? activeThreadId : null,
                    user_email: userEmail
                }),
            });

            if (!response.ok) throw new Error("Backend connection failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                const snapshotText = accumulatedText;

                setMessages(prev => {
                    const updated = [...prev];
                    const lastMsgIndex = updated.length - 1;
                    if (lastMsgIndex >= 0) {
                        updated[lastMsgIndex] = { ...updated[lastMsgIndex], text: snapshotText };
                    }
                    return updated;
                });
            }

            const headerThreadId = response.headers.get("X-Thread-Id");
            if (headerThreadId && headerThreadId !== activeThreadId) {
                setActiveThreadId(headerThreadId);
                setTimeout(fetchThreads, 1000);
            }

        } catch (error) {
            console.error("❌ Streaming error:", error);
            setMessages(prev => [
                ...prev.slice(0, -1),
                { sender: 'bot', text: "Connection lost. Please check if Google Colab is running." }
            ]);
            showToast('Connection lost. Check if Colab is running.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // ── Rename handlers ───────────────────────────────────────────────────────
    const startRename = (e, thread) => {
        e.stopPropagation();
        setRenamingThreadId(thread.id);
        setRenameValue(thread.title);
    };

    const submitRename = async (threadId) => {
        const trimmed = renameValue.trim();
        if (!trimmed) { setRenamingThreadId(null); return; }

        // Optimistically update sidebar
        setThreads(prev =>
            prev.map(t => t.id === threadId ? { ...t, title: trimmed } : t)
        );
        setRenamingThreadId(null);

        try {
            await fetch(`${BASE_URL}/hr/threads/${threadId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
                body: JSON.stringify({ title: trimmed })
            });
            showToast('Chat renamed successfully.');
        } catch (err) {
            console.error("❌ Failed to rename thread:", err);
            showToast('Failed to rename chat.', 'error');
            fetchThreads(); // revert on failure
        }
    };

    const handleRenameKeyDown = (e, threadId) => {
        if (e.key === 'Enter') submitRename(threadId);
        if (e.key === 'Escape') setRenamingThreadId(null);
    };

    // ── Delete handler ────────────────────────────────────────────────────────
    const handleDeleteThread = async (e, threadId) => {
        e.stopPropagation();

        const threadTitle = threads.find(t => t.id === threadId)?.title || 'this conversation';
        const yes = await askConfirm({
            icon: '🗑️',
            title: 'Delete this conversation?',
            message: `"${threadTitle}" will be permanently removed. This cannot be undone.`,
            confirmLabel: 'Yes, Delete',
            variant: 'danger'
        });
        if (!yes) return;

        // Optimistically remove from sidebar
        setThreads(prev => prev.filter(t => t.id !== threadId));

        // If the deleted thread is currently open, clear the chat
        if (activeThreadId === threadId) {
            setActiveThreadId(null);
            setMessages([]);
        }

        try {
            await fetch(`${BASE_URL}/hr/threads/${threadId}`, {
                method: 'DELETE',
                headers: { ...NGROK_HEADERS }
            });
            showToast('Conversation deleted.');
        } catch (err) {
            console.error("❌ Failed to delete thread:", err);
            showToast('Failed to delete conversation.', 'error');
            fetchThreads(); // revert on failure
        }
    };

    // ── Edit handlers ─────────────────────────────────────────────────────────
    const startEdit = (index, text) => {
        setEditingIndex(index);
        setEditValue(text);
    };

    const submitEdit = async () => {
        if (!editValue.trim() || editingIndex === null) return;
        const updatedMessages = messages.slice(0, editingIndex);
        setMessages(updatedMessages);
        setEditingIndex(null);
        setInput(editValue.trim());
        setEditValue('');
    };

    // ── Copy handler ──────────────────────────────────────────────────────────
    const handleCopy = async (index, text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (err) {
            console.error('❌ Copy failed:', err);
            showToast('Failed to copy text.', 'error');
        }
    };

    const startNewChat = () => {
        setActiveThreadId(`temp_${Date.now()}`);
        setMessages([]);
    };

    return (
        <div className="rag-layout">

            {/* ── Confirmation dialog (full-screen overlay) ─────────────────── */}
            <ConfirmDialog
                config={confirmConfig}
                onConfirm={handleConfirmYes}
                onCancel={handleConfirmNo}
            />

            {/* SIDEBAR */}
            <div className="chat-sidebar">
                <button className="new-chat-btn" onClick={startNewChat}>
                    + New Chat
                </button>
                <div className="thread-list">
                    {threads.length === 0 ? (
                        <p className="no-threads">No recent conversations</p>
                    ) : (
                        threads.map(thread => (
                            <div
                                key={thread.id}
                                className={`thread-item ${activeThreadId === thread.id ? 'active' : ''}`}
                                onClick={() => {
                                    if (renamingThreadId !== thread.id) setActiveThreadId(thread.id);
                                }}
                            >
                                <span className="thread-icon">💬</span>

                                {renamingThreadId === thread.id ? (
                                    <input
                                        ref={renameInputRef}
                                        className="rename-input"
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onBlur={() => submitRename(thread.id)}
                                        onKeyDown={e => handleRenameKeyDown(e, thread.id)}
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <div className="thread-info">
                                        <p className="thread-title">{thread.title}</p>
                                        <div className="thread-actions">
                                            <button
                                                className="rename-btn"
                                                title="Rename chat"
                                                onClick={e => startRename(e, thread)}
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="delete-thread-btn"
                                                title="Delete chat"
                                                onClick={e => handleDeleteThread(e, thread.id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* MAIN CHAT AREA */}
            <div className="chat-main">

                {/* ── Toast notifications (top-right of chat area) ─────────── */}
                <Toast toasts={toasts} />

                <div className="chat-window">
                    {messages.length === 0 && !loading ? (
                        <div className="welcome-screen">
                            <div className="lion-logo"></div>
                            <h2>HR Intelligence Assistant</h2>
                            <p>Ask me about candidate skills, experience, or fitment scores.</p>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, index) => (
                                <div key={index} className={`message-bubble ${msg.sender}`}>
                                    <div className="avatar">{msg.sender === 'user' ? 'HR' : ' '}</div>
                                    <div className="message-content">
                                        {msg.sender === 'user' && editingIndex === index ? (
                                            <div className="edit-area">
                                                <textarea
                                                    className="edit-textarea"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                                                        if (e.key === 'Escape') setEditingIndex(null);
                                                    }}
                                                    autoFocus
                                                />
                                                <div className="edit-actions">
                                                    <button className="edit-save-btn" onClick={submitEdit}>Send</button>
                                                    <button className="edit-cancel-btn" onClick={() => setEditingIndex(null)}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="message-text">
                                                {msg.sender === 'bot'
                                                    ? <RichText text={msg.text} />
                                                    : msg.text
                                                }
                                            </div>
                                        )}
                                        {editingIndex !== index && (
                                            <div className="msg-actions">
                                                {msg.sender === 'user' && (
                                                    <button
                                                        className="msg-action-btn"
                                                        title="Edit message"
                                                        onClick={() => startEdit(index, msg.text)}
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                )}
                                                {msg.sender === 'bot' && msg.text && (
                                                    <button
                                                        className="msg-action-btn copy-btn"
                                                        title="Copy response"
                                                        onClick={() => handleCopy(index, msg.text)}
                                                    >
                                                        {copiedIndex === index ? '✅ Copied!' : '📋 Copy'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && messages[messages.length - 1]?.text === "" && (
                                <div className="message-bubble bot thinking">
                                    <div className="avatar"></div>
                                    <div className="message-text italic">Analyzing resumes...</div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* INPUT BOX */}
                <div className="input-container">
                    <div className="input-wrapper">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Type your query..."
                            disabled={loading}
                        />
                        <button onClick={handleSend} disabled={loading || !input.trim()} className="send-btn">
                            {loading ? "..." : "Send"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RagChat;
