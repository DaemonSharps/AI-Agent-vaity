# Этап 02: MongoDB Chat Storage

## Цель

Реализовать хранение чатов, сообщений и Ollama context в MongoDB, а также HTTP API для управления чатами и загрузки истории.

## Начало этапа

Начинать этап можно, если завершен этап 01:

- MongoDB-настройки есть в `appsettings.json`.
- `MongoDbOptions` зарегистрирован через `IOptions<>`.
- Пакет `MongoDB.Driver` установлен.
- `docker compose config` проходит.

## Задачи

### 1. Создать MongoDB-модели

Создать модели документов для MongoDB.

`ChatDocument` должен содержать:

- `Id`
- `UserId`
- `Title`
- `CreatedAt`
- `UpdatedAt`
- `OllamaContext`

`MessageDocument` должен содержать:

- `Id`
- `ChatId`
- `UserId`
- `Role`
- `Content`
- `Thinking`
- `CreatedAt`
- `Status`
- `Order`

Для MVP использовать одного неявного пользователя:

```csharp
const string DefaultUserId = "default";
```

### 2. Создать сервис доступа к MongoDB

Создать сервис, который через `IOptions<MongoDbOptions>` создает:

- MongoDB client
- database
- collection для чатов
- collection для сообщений

Коллекции можно назвать:

- `chats`
- `messages`

### 3. Реализовать репозиторий чатов

Репозиторий должен уметь:

- Получить список чатов текущего пользователя.
- Получить чат по id.
- Создать чат.
- Переименовать чат.
- Удалить чат.
- Проверить лимит 10 чатов на пользователя.
- Сохранить Ollama context для чата.

Правила:

- Если у пользователя уже 10 чатов, создание нового чата должно возвращать ошибку.
- В MVP пользователь всегда `default`.
- При удалении чата нужно удалить и его сообщения.

### 4. Реализовать репозиторий сообщений

Репозиторий должен уметь:

- Получить сообщения чата в порядке `Order`.
- Добавить пользовательское сообщение.
- Создать assistant-сообщение со статусом `streaming`.
- Обновить assistant-сообщение после завершения генерации.
- Пометить assistant-сообщение как `failed`.

### 5. Реализовать HTTP endpoints

Добавить endpoints:

```http
GET /api/chats
POST /api/chats
GET /api/chats/{chatId}
PATCH /api/chats/{chatId}
DELETE /api/chats/{chatId}
GET /api/chats/{chatId}/messages
```

Минимальные правила:

- `POST /api/chats` создает чат с автоматическим названием.
- `PATCH /api/chats/{chatId}` переименовывает чат.
- `DELETE /api/chats/{chatId}` удаляет чат и сообщения.
- `GET /api/chats/{chatId}/messages` возвращает историю сообщений.

## Конец этапа

Этап завершен, когда:

- MongoDB-модели созданы.
- Репозитории работают через `MongoDB.Driver`.
- HTTP endpoints доступны.
- Лимит 10 чатов реализован на backend.
- История сообщений читается из MongoDB.
- Проект собирается и запускается.

## Проверки

Выполнить:

```powershell
dotnet build AI-Agent-vaity.sln
docker compose config
docker compose up --build
```

После запуска вручную проверить HTTP API:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/chats
```

Остановить стек:

```powershell
docker compose down
```

## Стабильное состояние после этапа

Backend уже умеет хранить чаты и сообщения в MongoDB. Frontend может оставаться прежним или временно не использовать новые endpoints, но приложение должно запускаться.
