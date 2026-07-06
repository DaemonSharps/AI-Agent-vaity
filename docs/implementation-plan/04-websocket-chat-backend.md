# Этап 04: WebSocket Chat Backend

## Цель

Реализовать backend WebSocket endpoint `/ws/chats/{chatId}` для отправки пользовательских сообщений и потоковой передачи ответа ассистента.

## Начало этапа

Начинать этап можно, если завершен этап 03:

- MongoDB-хранилище работает.
- `OllamaChatService` существует.
- Ollama настраивается через `IOptions<OllamaOptions>`.
- Refit-клиент использует `/api/chat`.

## WebSocket-контракт

Endpoint:

```text
GET /ws/chats/{chatId}
```

`chatId` передается только в URL. Payload не должен содержать `chatId`.

Сообщение от frontend:

```json
{
  "type": "user_message",
  "content": "Привет"
}
```

События backend:

```json
{ "type": "user_message_saved", "messageId": "msg_user_123", "status": "sent" }
```

```json
{ "type": "assistant_started", "messageId": "msg_assistant_123", "status": "streaming" }
```

```json
{ "type": "assistant_thinking_delta", "messageId": "msg_assistant_123", "content": "..." }
```

```json
{ "type": "assistant_delta", "messageId": "msg_assistant_123", "content": "..." }
```

```json
{ "type": "assistant_complete", "messageId": "msg_assistant_123", "status": "complete" }
```

```json
{ "type": "error", "message": "Не удалось получить ответ от модели." }
```

`assistant_thinking_delta` отправлять только если Ollama вернула thinking.

## Задачи

### 1. Включить WebSocket middleware

В `Program.cs` добавить WebSocket middleware.

### 2. Реализовать endpoint `/ws/chats/{chatId}`

Endpoint должен:

- Проверить, что запрос является WebSocket-запросом.
- Получить `chatId` из URL.
- Проверить, что чат существует у пользователя `default`.
- Принять WebSocket-соединение.
- Читать входящие JSON-сообщения.
- Обрабатывать только `type = user_message`.

### 3. Валидировать пользовательское сообщение

Правила:

- Пустой `content` запрещен.
- `content` длиннее 4000 символов запрещен.
- При ошибке отправить WebSocket-событие `error`.

### 4. Сохранять пользовательское сообщение

После валидации:

- Сохранить user message в MongoDB.
- Отправить `user_message_saved`.

### 5. Создавать assistant-сообщение

Перед вызовом Ollama:

- Создать assistant message со статусом `streaming`.
- Отправить `assistant_started`.

### 6. Вызвать Ollama и передать stream во frontend

Backend должен:

- Загрузить сохраненный Ollama context текущего чата из MongoDB.
- Передать context в `OllamaChatService`.
- Читать события сервиса.
- Для thinking отправлять `assistant_thinking_delta`.
- Для обычного текста отправлять `assistant_delta`.
- Накопить итоговый `content` и `thinking`.

### 7. Завершить assistant-сообщение

После завершения stream:

- Сохранить итоговый `content`.
- Сохранить итоговый `thinking`, если он был.
- Сохранить обновленный Ollama context в MongoDB.
- Обновить статус assistant message на `complete`.
- Отправить `assistant_complete`.

При ошибке:

- Обновить assistant message на `failed`, если оно уже создано.
- Отправить `error`.

## Конец этапа

Этап завершен, когда:

- `/ws/chats/{chatId}` принимает WebSocket-соединения.
- `chatId` не дублируется в payload.
- Пользовательское сообщение сохраняется в MongoDB.
- Assistant-сообщение создается и обновляется.
- Streaming content передается через WebSocket.
- Thinking передается отдельно и только при наличии.
- Ollama context сохраняется после завершения ответа.
- Проект собирается и запускается.

## Проверки

Выполнить:

```powershell
dotnet build AI-Agent-vaity.sln
docker compose config
docker compose up --build
```

Ручная проверка WebSocket возможна через Postman, Insomnia или другой WebSocket-клиент.

Остановить стек:

```powershell
docker compose down
```

## Стабильное состояние после этапа

Backend имеет рабочий WebSocket-чат. Frontend может еще не использовать WebSocket, но backend и compose должны запускаться стабильно.
