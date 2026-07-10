import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { locale, text } from './localization';

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

type ChatMode = 'normal' | 'thinking';

type WsEvent = {
  type: string;
  messageId?: string;
  status?: Message['status'];
  content?: string;
  message?: string;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');
const maxMessageLength = 4000;

const timeFormatter = new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit' });

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedMode, setSelectedMode] = useState<ChatMode>('normal');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSocketOpen, setIsSocketOpen] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [renameChatTarget, setRenameChatTarget] = useState<Chat | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteChatTarget, setDeleteChatTarget] = useState<Chat | null>(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  const lastSentMessageRef = useRef<string>('');
  const lastSentModeRef = useRef<ChatMode>('normal');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const isChatLimitReached = chats.length >= 10;
  const isDraftTooLong = draft.length > maxMessageLength;
  const canSend = Boolean(activeChatId && draft.trim() && !isDraftTooLong && !isSending && isSocketOpen);

  useEffect(() => {
    document.title = text.app.documentTitle;
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
      throw new Error(text.errors.requestFailed(response.status));
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
      setError(getErrorMessage(reason, text.errors.loadChats));
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
      setError(getErrorMessage(reason, text.errors.loadMessages));
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
      setError(text.errors.websocketFailed);
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
      setError(text.errors.modelResponseFailed);
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
      setError(text.errors.chatLimitReached);
      return;
    }

    try {
      const chat = await request<Chat>('/api/chats', { method: 'POST' });
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.id);
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, text.errors.createChat));
    }
  }

  function openRenameChat(chat: Chat) {
    setRenameChatTarget(chat);
    setRenameTitle(chat.title);
    setError(null);
  }

  async function submitRenameChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!renameChatTarget) {
      return;
    }

    const title = renameTitle.trim();
    if (!title) {
      setError(text.errors.titleRequired);
      return;
    }

    setIsModalSubmitting(true);
    try {
      const updatedChat = await request<Chat>(`/api/chats/${renameChatTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setChats((current) => current.map((item) => (item.id === updatedChat.id ? updatedChat : item)));
      setRenameChatTarget(null);
      setRenameTitle('');
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, text.errors.renameChat));
    } finally {
      setIsModalSubmitting(false);
    }
  }

  function openDeleteChat(chat: Chat) {
    setDeleteChatTarget(chat);
    setError(null);
  }

  async function confirmDeleteChat() {
    if (!deleteChatTarget) {
      return;
    }

    setIsModalSubmitting(true);
    try {
      await request<void>(`/api/chats/${deleteChatTarget.id}`, { method: 'DELETE' });
      setChats((current) => {
        const nextChats = current.filter((item) => item.id !== deleteChatTarget.id);
        if (activeChatId === deleteChatTarget.id) {
          setActiveChatId(nextChats[0]?.id ?? null);
        }
        return nextChats;
      });
      setDeleteChatTarget(null);
      setError(null);
    } catch (reason) {
      setError(getErrorMessage(reason, text.errors.deleteChat));
    } finally {
      setIsModalSubmitting(false);
    }
  }

  function closeModal() {
    if (isModalSubmitting) {
      return;
    }

    setRenameChatTarget(null);
    setRenameTitle('');
    setDeleteChatTarget(null);
  }

  function sendDraft() {
    sendMessage(draft, selectedMode);
  }

  function retryLastMessage() {
    sendMessage(lastSentMessageRef.current, lastSentModeRef.current);
  }

  function sendMessage(rawContent: string, mode: ChatMode) {
    const content = rawContent.trim();
    const socket = socketRef.current;

    if (!activeChatId || !socket || socket.readyState !== WebSocket.OPEN || isSending) {
      return;
    }

    if (!content) {
      setError(text.errors.messageRequired);
      return;
    }

    if (content.length > maxMessageLength) {
      setError(text.errors.messageTooLong);
      return;
    }

    const tempId = `pending-${Date.now()}`;
    pendingUserMessageIdRef.current = tempId;
    lastSentMessageRef.current = content;
    lastSentModeRef.current = mode;
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
    socket.send(JSON.stringify({ type: 'user_message', content, mode }));
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
            <p className="eyebrow">{text.app.productName}</p>
            <h1>{text.sidebar.title}</h1>
          </div>
          <button className="primary-button" onClick={createChat} disabled={isChatLimitReached}>
            {text.sidebar.newChat}
          </button>
        </div>

        <p className="limit-copy">{text.sidebar.chatLimit(chats.length, 10)}</p>
        {isChatLimitReached ? <p className="error-text">{text.sidebar.chatLimitReached}</p> : null}

        <div className="chat-list">
          {isLoading ? <p className="muted">{text.sidebar.loadingChats}</p> : null}
          {!isLoading && chats.length === 0 ? <p className="empty-state">{text.sidebar.emptyChats}</p> : null}
          {chats.map((chat) => (
            <article className={chat.id === activeChatId ? 'chat-list-item active' : 'chat-list-item'} key={chat.id}>
              <button className="chat-select" onClick={() => setActiveChatId(chat.id)}>
                <span>{chat.title}</span>
                <time>{formatDate(chat.updatedAt)}</time>
              </button>
              <div className="chat-actions">
                <button onClick={() => openRenameChat(chat)}>{text.sidebar.rename}</button>
                <button onClick={() => openDeleteChat(chat)}>{text.sidebar.delete}</button>
              </div>
            </article>
          ))}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="eyebrow">{text.chat.currentChat}</p>
            <h2>{activeChat?.title ?? text.chat.noChatSelected}</h2>
          </div>
          <span className={isSocketOpen ? 'status-pill connected' : 'status-pill'}>
            {activeChatId ? (isSocketOpen ? text.connection.connected : text.connection.connecting) : text.connection.idle}
          </span>
        </header>

        {error ? (
          <div className="error-banner">
            <span>{error}</span>
            {lastSentMessageRef.current && !isSending ? <button onClick={retryLastMessage}>{text.actions.retry}</button> : null}
          </div>
        ) : null}

        <div className="messages" onScroll={handleMessagesScroll} ref={messagesRef}>
          {!activeChatId ? <p className="empty-state centered">{text.chat.selectOrCreateChat}</p> : null}
          {activeChatId && messages.length === 0 ? <p className="empty-state centered">{text.chat.emptyMessages}</p> : null}
          {messages.map((message) => (
            <MessageBubble message={message} key={message.id} />
          ))}
          <div ref={bottomRef} />
        </div>

        {!isAtBottom ? (
          <button className="jump-button" onClick={() => bottomRef.current?.scrollIntoView({ block: 'end' })}>
            {text.chat.jumpToLatest}
          </button>
        ) : null}

        <footer className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder={activeChatId ? text.composer.placeholder : text.composer.disabledPlaceholder}
            disabled={!activeChatId || isSending}
            rows={3}
          />
          <div className="composer-footer">
            <span className={isDraftTooLong ? 'error-text' : 'muted'}>{draft.length}/{maxMessageLength}</span>
            <div className="composer-controls">
              <label className="mode-select-label" htmlFor="chat-mode-select">
                <span>{text.composer.modeLabel}</span>
                <select
                  id="chat-mode-select"
                  value={selectedMode}
                  onChange={(event) => setSelectedMode(event.target.value as ChatMode)}
                  disabled={!activeChatId || isSending}
                >
                  <option value="normal">{text.composer.modes.normal}</option>
                  <option value="thinking">{text.composer.modes.thinking}</option>
                </select>
              </label>
              <button className="send-button" onClick={sendDraft} disabled={!canSend}>
                {isSending ? text.composer.sending : text.composer.send}
              </button>
            </div>
          </div>
          <p className="hint">{text.composer.hint}</p>
        </footer>
      </section>

      {renameChatTarget ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="rename-chat-title" onMouseDown={(event) => event.stopPropagation()}>
            <form onSubmit={submitRenameChat}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{text.modal.renameSection}</p>
                  <h3 id="rename-chat-title">{text.modal.renameTitle}</h3>
                </div>
              </div>

              <label className="field-label" htmlFor="rename-chat-input">{text.modal.titleField}</label>
              <input
                id="rename-chat-input"
                autoFocus
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
                disabled={isModalSubmitting}
                maxLength={120}
              />

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeModal} disabled={isModalSubmitting}>{text.modal.cancel}</button>
                <button className="primary-button" type="submit" disabled={isModalSubmitting || !renameTitle.trim()}>
                  {isModalSubmitting ? text.modal.saving : text.modal.save}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleteChatTarget ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="modal-card danger" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{text.modal.dangerSection}</p>
                <h3 id="delete-chat-title">{text.modal.deleteTitle}</h3>
              </div>
            </div>

            <p className="modal-copy">{text.modal.deleteCopy(deleteChatTarget.title)}</p>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={closeModal} disabled={isModalSubmitting}>{text.modal.cancel}</button>
              <button className="danger-button" type="button" onClick={confirmDeleteChat} disabled={isModalSubmitting}>
                {isModalSubmitting ? text.modal.deleting : text.modal.delete}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-meta">
        <strong>{message.role === 'user' ? text.message.user : text.message.assistant}</strong>
        <span>{timeFormatter.format(new Date(message.createdAt))}</span>
        <span>{text.message.status[message.status]}</span>
      </div>

      {message.thinking ? (
        <details className="thinking" open={message.status === 'streaming'}>
          <summary>{text.message.thinking}</summary>
          <p>{message.thinking}</p>
        </details>
      ) : null}

      {message.role === 'assistant' ? (
        <div className="markdown-body">
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            allowedElements={[
              'p',
              'h1',
              'h2',
              'h3',
              'ul',
              'ol',
              'li',
              'a',
              'blockquote',
              'code',
              'strong',
              'em',
              'table',
              'thead',
              'tbody',
              'tr',
              'th',
              'td',
            ]}
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
            {message.content || (message.status === 'streaming' ? text.message.generating : '')}
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
  return dateFormatter.format(new Date(value));
}

function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
