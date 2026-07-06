import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  createdAt: string;
  status: 'pending' | 'sent' | 'streaming' | 'failed' | 'complete';
  order: number;
};

type WsEvent = {
  type: string;
  messageId?: string;
  status?: Message['status'];
  content?: string;
  message?: string;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const maxMessageLength = 4000;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSocketOpen, setIsSocketOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  const lastSentMessageRef = useRef<string>('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const isChatLimitReached = chats.length >= 10;
  const isDraftTooLong = draft.length > maxMessageLength;
  const canSend = Boolean(activeChatId && draft.trim() && !isDraftTooLong && !isSending && isSocketOpen);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      socketRef.current?.close();
      socketRef.current = null;
      setIsSocketOpen(false);
      return;
    }

    loadMessages(activeChatId);
    openSocket(activeChatId);

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      setIsSocketOpen(false);
    };
  }, [activeChatId]);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, isAtBottom]);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function loadChats() {
    setIsLoading(true);
    setError(null);

    try {
      const loadedChats = await request<Chat[]>('/api/chats');
      setChats(loadedChats);
      setActiveChatId((current) => current ?? loadedChats[0]?.id ?? null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load chats.'));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMessages(chatId: string) {
    setError(null);

    try {
      const loadedMessages = await request<Message[]>(`/api/chats/${chatId}/messages`);
      setMessages(loadedMessages);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load chat history.'));
    }
  }

  function openSocket(chatId: string) {
    socketRef.current?.close();
    setIsSocketOpen(false);

    const wsUrl = `${apiUrl.replace(/^http/i, 'ws')}/ws/chats/${chatId}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsSocketOpen(true);
      setError(null);
    };

    socket.onclose = () => {
      setIsSocketOpen(false);
    };

    socket.onerror = () => {
      setError('WebSocket connection failed.');
      setIsSending(false);
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as WsEvent;
      handleSocketEvent(payload, chatId);
    };
  }

  function handleSocketEvent(event: WsEvent, chatId: string) {
    if (event.type === 'user_message_saved' && event.messageId) {
      const pendingId = pendingUserMessageIdRef.current;
      pendingUserMessageIdRef.current = null;
      setMessages((current) => current.map((message) => (
        message.id === pendingId ? { ...message, id: event.messageId!, status: 'sent' } : message
      )));
      return;
    }

    if (event.type === 'assistant_started' && event.messageId) {
      setMessages((current) => [
        ...current,
        {
          id: event.messageId!,
          chatId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          status: 'streaming',
          order: getNextOrder(current),
        },
      ]);
      return;
    }

    if (event.type === 'assistant_delta' && event.messageId && event.content) {
      appendToMessage(event.messageId, 'content', event.content);
      return;
    }

    if (event.type === 'assistant_thinking_delta' && event.messageId && event.content) {
      appendToMessage(event.messageId, 'thinking', event.content);
      return;
    }

    if (event.type === 'assistant_complete' && event.messageId) {
      setIsSending(false);
      setMessages((current) => current.map((message) => (
        message.id === event.messageId ? { ...message, status: 'complete' } : message
      )));
      loadMessages(chatId);
      loadChats();
      return;
    }

    if (event.type === 'error') {
      setError(event.message ?? 'Unable to get response from the model.');
      setIsSending(false);
      setMessages((current) => current.map((message) => (
        message.status === 'pending' || message.status === 'streaming' ? { ...message, status: 'failed' } : message
      )));
      if (!draft && lastSentMessageRef.current) {
        setDraft(lastSentMessageRef.current);
      }
    }
  }

  function appendToMessage(messageId: string, field: 'content' | 'thinking', value: string) {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, [field]: `${message[field] ?? ''}${value}` } : message
    )));
  }

  async function createChat() {
    if (isChatLimitReached) {
      setError('Chat limit reached. Delete a chat before creating a new one.');
      return;
    }

    try {
      const chat = await request<Chat>('/api/chats', { method: 'POST' });
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.id);
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to create chat.'));
    }
  }

  async function renameChat(chat: Chat) {
    const title = window.prompt('Rename chat', chat.title)?.trim();
    if (!title) {
      return;
    }

    try {
      const updatedChat = await request<Chat>(`/api/chats/${chat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setChats((current) => current.map((item) => (item.id === updatedChat.id ? updatedChat : item)));
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to rename chat.'));
    }
  }

  async function deleteChat(chat: Chat) {
    if (!window.confirm(`Delete "${chat.title}"?`)) {
      return;
    }

    try {
      await request<void>(`/api/chats/${chat.id}`, { method: 'DELETE' });
      setChats((current) => {
        const nextChats = current.filter((item) => item.id !== chat.id);
        if (activeChatId === chat.id) {
          setActiveChatId(nextChats[0]?.id ?? null);
        }
        return nextChats;
      });
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to delete chat.'));
    }
  }

  function sendDraft() {
    sendMessage(draft);
  }

  function retryLastMessage() {
    sendMessage(lastSentMessageRef.current);
  }

  function sendMessage(rawContent: string) {
    const content = rawContent.trim();
    const socket = socketRef.current;

    if (!activeChatId || !socket || socket.readyState !== WebSocket.OPEN || isSending) {
      return;
    }

    if (!content) {
      setError('Message is required.');
      return;
    }

    if (content.length > maxMessageLength) {
      setError('Message is longer than 4000 characters.');
      return;
    }

    const tempId = `pending-${Date.now()}`;
    pendingUserMessageIdRef.current = tempId;
    lastSentMessageRef.current = content;
    setMessages((current) => [
      ...current,
      {
        id: tempId,
        chatId: activeChatId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        status: 'pending',
        order: getNextOrder(current),
      },
    ]);
    setDraft('');
    setError(null);
    setIsSending(true);
    socket.send(JSON.stringify({ type: 'user_message', content }));
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendDraft();
    }
  }

  function handleMessagesScroll() {
    const element = messagesRef.current;
    if (!element) {
      return;
    }

    setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">AI Agent</p>
            <h1>Chats</h1>
          </div>
          <button className="primary-button" onClick={createChat} disabled={isChatLimitReached}>
            New
          </button>
        </div>

        <p className="limit-copy">{chats.length}/10 chats</p>
        {isChatLimitReached ? <p className="error-text">Chat limit reached.</p> : null}

        <div className="chat-list">
          {isLoading ? <p className="muted">Loading chats...</p> : null}
          {!isLoading && chats.length === 0 ? <p className="empty-state">No chats yet. Create one to start.</p> : null}
          {chats.map((chat) => (
            <article className={chat.id === activeChatId ? 'chat-list-item active' : 'chat-list-item'} key={chat.id}>
              <button className="chat-select" onClick={() => setActiveChatId(chat.id)}>
                <span>{chat.title}</span>
                <time>{formatDate(chat.updatedAt)}</time>
              </button>
              <div className="chat-actions">
                <button onClick={() => renameChat(chat)}>Rename</button>
                <button onClick={() => deleteChat(chat)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Current chat</p>
            <h2>{activeChat?.title ?? 'No chat selected'}</h2>
          </div>
          <span className={isSocketOpen ? 'status-pill connected' : 'status-pill'}>
            {activeChatId ? (isSocketOpen ? 'Connected' : 'Connecting') : 'Idle'}
          </span>
        </header>

        {error ? (
          <div className="error-banner">
            <span>{error}</span>
            {lastSentMessageRef.current && !isSending ? <button onClick={retryLastMessage}>Retry</button> : null}
          </div>
        ) : null}

        <div className="messages" onScroll={handleMessagesScroll} ref={messagesRef}>
          {!activeChatId ? <p className="empty-state centered">Select or create a chat.</p> : null}
          {activeChatId && messages.length === 0 ? <p className="empty-state centered">Ask the agent anything.</p> : null}
          {messages.map((message) => (
            <MessageBubble message={message} key={message.id} />
          ))}
          <div ref={bottomRef} />
        </div>

        {!isAtBottom ? (
          <button className="jump-button" onClick={() => bottomRef.current?.scrollIntoView({ block: 'end' })}>
            Jump to latest
          </button>
        ) : null}

        <footer className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder={activeChatId ? 'Message the agent...' : 'Create a chat first'}
            disabled={!activeChatId || isSending}
            rows={3}
          />
          <div className="composer-footer">
            <span className={isDraftTooLong ? 'error-text' : 'muted'}>{draft.length}/{maxMessageLength}</span>
            <button className="send-button" onClick={sendDraft} disabled={!canSend}>
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="hint">Enter sends. Shift + Enter adds a new line.</p>
        </footer>
      </section>
    </main>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-meta">
        <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
        <span>{timeFormatter.format(new Date(message.createdAt))}</span>
        <span>{message.status}</span>
      </div>

      {message.thinking ? (
        <details className="thinking" open={message.status === 'streaming'}>
          <summary>Thinking</summary>
          <p>{message.thinking}</p>
        </details>
      ) : null}

      {message.role === 'assistant' ? (
        <div className="markdown-body">
          <ReactMarkdown
            skipHtml
            allowedElements={['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'strong', 'em']}
            components={{
              a({ href, children, ...props }) {
                const safeHref = sanitizeHref(href);
                const isExternal = safeHref?.startsWith('http://') || safeHref?.startsWith('https://');
                return (
                  <a href={safeHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noreferrer' : undefined} {...props}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {message.content || (message.status === 'streaming' ? 'Generating...' : '')}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="plain-message">{message.content}</p>
      )}
    </article>
  );
}

function sanitizeHref(href: string | undefined) {
  if (!href) {
    return undefined;
  }

  if (href.startsWith('/') || href.startsWith('#')) {
    return href;
  }

  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

function getNextOrder(messages: Message[]) {
  return messages.reduce((maxOrder, message) => Math.max(maxOrder, message.order), 0) + 1;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' }).format(new Date(value));
}

function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
