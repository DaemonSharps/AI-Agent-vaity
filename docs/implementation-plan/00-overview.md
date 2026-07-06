# План реализации AI Agent Chat

## Назначение

Этот набор документов описывает пошаговую реализацию требований из `docs/rfc-ai-agent-chat.md`.

План специально разбит на небольшие этапы, чтобы его могла выполнять более слабая модель. После каждого этапа проект должен оставаться в стабильном состоянии: собираться, запускаться и не содержать заведомо сломанного функционала.

## Источник требований

Основной документ требований: `docs/rfc-ai-agent-chat.md`.

Если план и RFC расходятся, приоритет имеет RFC.

## Общие правила реализации

- Не начинать следующий этап, пока не выполнены критерии завершения текущего этапа.
- После каждого этапа запускать проверки, указанные в документе этапа.
- Не добавлять функции, которых нет в RFC.
- Не добавлять авторизацию в MVP.
- Не добавлять поиск, закрепление, архивацию, экспорт, импорт и вложения.
- Не добавлять тесты, если они не были отдельно запрошены.
- Не менять модель Ollama: используется `qwen3.5:4b`.
- Не выполнять `ollama pull`: модель считается загруженной заранее.
- Не хранить историю чатов в local storage или IndexedDB.
- История, сообщения и Ollama context хранятся в MongoDB.
- WebSocket payload не должен содержать `chatId`; `chatId` передается только в URL `/ws/chats/{chatId}`.

## Определение стабильного состояния

Этап считается стабильным, если:

- `dotnet build AI-Agent-vaity.sln` проходит без ошибок.
- `npm run build --prefix frontend` проходит без ошибок, если этап затрагивал frontend.
- `docker compose config` проходит без ошибок, если этап затрагивал compose.
- `docker compose up --build` может поднять стек без синтаксических ошибок конфигурации.
- Существующий уже реализованный функционал не сломан намеренно.

## Этапы

1. `01-backend-infrastructure.md` - подготовить backend: NuGet-пакеты, настройки, options, compose-зависимости.
2. `02-mongodb-chat-storage.md` - реализовать MongoDB-хранилище, модели и HTTP API управления чатами.
3. `03-ollama-refit-client.md` - реализовать Refit-клиент Ollama `/api/chat` и сервис streaming-разбора.
4. `04-websocket-chat-backend.md` - реализовать WebSocket endpoint и backend-логику чата.
5. `05-frontend-chat-shell.md` - заменить стартовый UI на shell чата и подключить HTTP API.
6. `06-frontend-websocket-markdown.md` - подключить WebSocket, streaming-ответы, thinking и безопасный Markdown.
7. `07-final-stabilization.md` - финальная интеграция, compose-запуск и ручная проверка MVP.

## Рекомендуемый порядок коммитов

Коммиты не обязательны, но если они используются, лучше делать один коммит на этап:

- `stage 01 backend infrastructure`
- `stage 02 mongodb chat storage`
- `stage 03 ollama refit client`
- `stage 04 websocket chat backend`
- `stage 05 frontend chat shell`
- `stage 06 frontend websocket markdown`
- `stage 07 final stabilization`
