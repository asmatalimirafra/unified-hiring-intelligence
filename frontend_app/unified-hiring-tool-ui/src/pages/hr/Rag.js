import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Rag.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';

// Secret pass to bypass the Ngrok landing page for API calls
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420",
};

const RagChat = () => {
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef(null);

    // 1. Identify current user (checks both common naming conventions)
    const user = JSON.parse(localStorage.getItem('user')) || {};
    const userEmail = user.email || user.user_email || "admin@company.com";

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // 2. FETCH SIDEBAR THREADS
    const fetchThreads = useCallback(async () => {
        if (!userEmail) return;
        try {
            const res = await fetch(`${BASE_URL}/hr/threads/${userEmail}`, {
                headers: { ...NGROK_HEADERS }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                setThreads(data);
            }
        } catch (err) {
            console.error("❌ Failed to fetch threads:", err);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    // 3. LOAD SELECTED THREAD HISTORY
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
                }
            }
        };
        loadHistory();
    }, [activeThreadId]);

    // 4. STREAMING CHAT HANDLER
    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const currentInput = input;
        const userMessage = { sender: 'user', text: currentInput };
        
        // Optimistically update UI: Add User message and a blank Bot placeholder
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

            // Handle Streaming Content
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = ""; 

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;

                // Capture current value in a constant to satisfy ESLint loop safety
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

            // Capture the Thread ID from custom header (crucial for new chats)
            const headerThreadId = response.headers.get("X-Thread-Id");
            if (headerThreadId && headerThreadId !== activeThreadId) {
                setActiveThreadId(headerThreadId);
                // Refresh sidebar so the new chat title appears
                setTimeout(fetchThreads, 1000); 
            }

        } catch (error) {
            console.error("❌ Streaming error:", error);
            setMessages(prev => [
                ...prev.slice(0, -1), // remove the empty bot bubble
                { sender: 'bot', text: "Connection lost. Please check if Google Colab is running." }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const startNewChat = () => {
        setActiveThreadId(`temp_${Date.now()}`);
        setMessages([]);
    };

    return (
        <div className="rag-layout">
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
                                onClick={() => setActiveThreadId(thread.id)}
                            >
                                <span className="thread-icon">💬</span>
                                <div className="thread-info">
                                    <p className="thread-title">{thread.title}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* MAIN CHAT AREA */}
            <div className="chat-main">
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
                                    <div className="message-text">{msg.text}</div>
                                </div>
                            ))}
                            {/* Show "Thinking" only before the first chunk arrives */}
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