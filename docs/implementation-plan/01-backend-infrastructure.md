# Этап 01: Backend Infrastructure

## Цель

Подготовить backend к дальнейшей реализации: добавить зависимости, настройки MongoDB/Ollama, options-классы, DI-регистрации и базовую инфраструктуру без изменения поведения frontend.

## Начало этапа

Начинать этап можно, если:

- В репозитории есть `backend/Api.csproj`.
- В корне есть `AI-Agent-vaity.sln`.
- В корне есть `docker-compose.yml` с сервисами `backend`, `frontend`, `mongo` и `ollama`.
- `dotnet build AI-Agent-vaity.sln` проходит.
- `docker compose config` проходит.

## Задачи

### 1. Добавить NuGet-пакеты

В backend добавить пакеты:

- `MongoDB.Driver`
- `Refit`
- `Refit.HttpClientFactory`

Рекомендуемая команда:

```powershell
dotnet add backend/Api.csproj package MongoDB.Driver
```

### 2. Добавить настройки в `backend/appsettings.json`

Добавить секции:

```json
{
  "MongoDb": {
    "ConnectionString": "mongodb://mongo:27017",
    "DatabaseName": "ai_agent_chat"
  },
  "Ollama": {
    "BaseUrl": "http://ollama:11434",
    "Model": "qwen3.5:4b",
    "UseStream": true,
    "UseThink": true
  }
}
```

Не удалять существующую секцию `Logging`.

### 3. Добавить options-классы

Создать backend-классы:

- `MongoDbOptions`
- `OllamaOptions`

Требования:

- Доступ к настройкам выполняется через `IOptions<>`.
- Названия секций должны совпадать с `MongoDb` и `Ollama`.
- Не хардкодить `BaseUrl`, `Model`, connection string и имя базы в сервисах.

### 4. Зарегистрировать options в `Program.cs`

Добавить:

- `builder.Services.Configure<MongoDbOptions>(...)`
- `builder.Services.Configure<OllamaOptions>(...)`

На этом этапе не нужно реализовывать бизнес-логику чата.

### 5. Проверить Docker Compose

Убедиться, что:

- У `backend` есть зависимость от `mongo` и `ollama`.
- У `mongo` есть named volume `mongo_data`.
- У `ollama` есть volume для данных модели.
- Приложение не выполняет `ollama pull`.

## Конец этапа

Этап завершен, когда:

- Backend собирается с новыми пакетами.
- Options-классы компилируются.
- Настройки MongoDB и Ollama есть в `appsettings.json`.
- `docker compose config` валиден.
- Frontend не сломан.

## Проверки

Выполнить:

```powershell
dotnet build AI-Agent-vaity.sln
npm run build --prefix frontend
docker compose config
```

## Стабильное состояние после этапа

Проект должен запускаться так же, как до этапа. Новая инфраструктура уже есть, но чат еще не реализован.
