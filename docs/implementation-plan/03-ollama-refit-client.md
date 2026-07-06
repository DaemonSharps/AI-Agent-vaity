# Этап 03: Ollama Refit Client

## Цель

Реализовать backend-интеграцию с Ollama API через Refit и подготовить сервис для потокового чтения ответа `/api/chat`.

## Начало этапа

Начинать этап можно, если завершен этап 02:

- MongoDB-хранилище работает.
- HTTP API управления чатами собирается.
- В `appsettings.json` есть секция `Ollama`.
- Пакеты `Refit` и `Refit.HttpClientFactory` установлены.

## Задачи

### 1. Создать Refit-интерфейс Ollama

Создать интерфейс для endpoint:

```http
POST /api/chat
```

Требования:

- Base URL брать из `Ollama:BaseUrl`.
- Model брать из `Ollama:Model`.
- Для MVP модель всегда `qwen3.5:4b`.
- Stream должен быть включен через `Ollama:UseStream`.
- Think должен быть включен через `Ollama:UseThink`, если API и модель это поддерживают.
- Refit-метод должен позволять читать потоковый response body.

Примечание для реализации:

Refit удобен для декларации API, но streaming нужно реализовать аккуратно. Допустимый вариант: Refit-метод возвращает `Task<HttpResponseMessage>`, а сервис читает response stream построчно.

### 2. Описать DTO для Ollama

Создать DTO для запроса `/api/chat`.

Минимальный request должен включать:

- `model`
- `messages`
- `stream`
- `think`, если поддерживается используемой версией Ollama
- `context`, если текущая версия Ollama возвращает и принимает context для `/api/chat`

Сообщения передавать с ролями:

- `user`
- `assistant`

### 3. Реализовать сервис `OllamaChatService`

Сервис должен:

- Принимать пользовательское сообщение.
- Принимать сохраненный Ollama context текущего чата.
- Вызывать `/api/chat` через Refit.
- Читать streaming response построчно.
- Разделять обычный content и thinking content, если thinking приходит отдельно.
- Не считать ошибкой отсутствие thinking.
- Возвращать поток доменных событий для WebSocket-слоя.
- Возвращать обновленный Ollama context после завершения генерации, если он есть в ответе.

### 4. Не подключать сервис к UI напрямую

На этом этапе не нужно менять frontend.

Не нужно делать отдельный публичный debug endpoint, если он не нужен для ручной проверки.

## Конец этапа

Этап завершен, когда:

- Refit-клиент Ollama зарегистрирован в DI.
- `OllamaChatService` компилируется.
- Сервис использует `IOptions<OllamaOptions>`.
- Endpoint `/api/chat` указан явно.
- Модель `qwen3.5:4b` берется из конфигурации.
- Отсутствие thinking обработано как нормальный сценарий.
- Проект собирается.

## Проверки

Выполнить:

```powershell
dotnet build AI-Agent-vaity.sln
docker compose config
```

При запущенном compose можно проверить доступность Ollama:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:11434/api/tags
```

## Стабильное состояние после этапа

Backend умеет обращаться к Ollama на уровне сервиса, но WebSocket-чат еще не подключен. Проект должен запускаться без обязательного пользовательского сценария чата.
