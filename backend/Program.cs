using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Api;
using Api.Data;
using Api.Ollama;
using Api.Options;
using Api.Repositories;
using Api.WebSockets;
using Microsoft.Extensions.Options;
using Refit;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<MongoDbOptions>(builder.Configuration.GetSection(MongoDbOptions.SectionName));
builder.Services.Configure<OllamaOptions>(builder.Configuration.GetSection(OllamaOptions.SectionName));
builder.Services.AddSingleton<MongoDbContext>();
builder.Services.AddScoped<IChatRepository, ChatRepository>();
builder.Services.AddScoped<IMessageRepository, MessageRepository>();
builder.Services.AddScoped<OllamaChatService>();
builder.Services.AddRefitClient<IOllamaApi>()
    .ConfigureHttpClient((services, client) =>
    {
        var options = services.GetRequiredService<IOptions<OllamaOptions>>().Value;
        client.BaseAddress = new Uri(options.BaseUrl);
        client.Timeout = Timeout.InfiniteTimeSpan;
    });

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();
app.UseWebSockets();

app.MapGet("/", () => Results.Ok(new { message = "AI Agent Chat API" }));

app.MapGet("/api/chats", async (IChatRepository chats, CancellationToken cancellationToken) =>
{
    var result = await chats.GetChatsAsync(AppConstants.DefaultUserId, cancellationToken);
    return Results.Ok(result.Select(ToChatResponse));
});

app.MapPost("/api/chats", async (IChatRepository chats, CancellationToken cancellationToken) =>
{
    var (chat, error) = await chats.CreateChatAsync(AppConstants.DefaultUserId, cancellationToken);
    if (chat is null)
    {
        return Results.Conflict(new { message = error ?? "Unable to create chat." });
    }

    return Results.Created($"/api/chats/{chat.Id}", ToChatResponse(chat));
});

app.MapGet("/api/chats/{chatId}", async (string chatId, IChatRepository chats, CancellationToken cancellationToken) =>
{
    var chat = await chats.GetChatAsync(chatId, AppConstants.DefaultUserId, cancellationToken);
    return chat is null ? Results.NotFound() : Results.Ok(ToChatResponse(chat));
});

app.MapPatch("/api/chats/{chatId}", async (string chatId, RenameChatRequest request, IChatRepository chats, CancellationToken cancellationToken) =>
{
    var title = request.Title.Trim();
    if (title.Length == 0)
    {
        return Results.BadRequest(new { message = "Title is required." });
    }

    var chat = await chats.RenameChatAsync(chatId, AppConstants.DefaultUserId, title, cancellationToken);
    return chat is null ? Results.NotFound() : Results.Ok(ToChatResponse(chat));
});

app.MapDelete("/api/chats/{chatId}", async (string chatId, IChatRepository chats, CancellationToken cancellationToken) =>
{
    var deleted = await chats.DeleteChatAsync(chatId, AppConstants.DefaultUserId, cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/chats/{chatId}/messages", async (string chatId, IChatRepository chats, IMessageRepository messages, CancellationToken cancellationToken) =>
{
    var chat = await chats.GetChatAsync(chatId, AppConstants.DefaultUserId, cancellationToken);
    if (chat is null)
    {
        return Results.NotFound();
    }

    var result = await messages.GetMessagesAsync(chatId, AppConstants.DefaultUserId, cancellationToken);
    return Results.Ok(result.Select(ToMessageResponse));
});

app.Map("/ws/chats/{chatId}", HandleChatWebSocketAsync);

app.Run();

static async Task HandleChatWebSocketAsync(
    HttpContext context,
    string chatId,
    IChatRepository chats,
    IMessageRepository messages,
    OllamaChatService ollama,
    ILogger<Program> logger)
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var chat = await chats.GetChatAsync(chatId, AppConstants.DefaultUserId, context.RequestAborted);
    if (chat is null)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();

    while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
    {
        string rawMessage;
        try
        {
            rawMessage = await ReceiveTextAsync(socket, context.RequestAborted);
        }
        catch (OperationCanceledException)
        {
            break;
        }

        if (string.IsNullOrWhiteSpace(rawMessage))
        {
            continue;
        }

        var clientMessage = JsonSerializer.Deserialize<ClientChatMessage>(rawMessage, AppJson.Options);
        if (clientMessage?.Type != WebSocketEventTypes.UserMessage)
        {
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.Error, message = "Unsupported message type." }, context.RequestAborted);
            continue;
        }

        var content = clientMessage.Content.Trim();
        if (content.Length == 0)
        {
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.Error, message = "Message is required." }, context.RequestAborted);
            continue;
        }

        if (content.Length > AppConstants.MaxMessageLength)
        {
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.Error, message = "Message is longer than 4000 characters." }, context.RequestAborted);
            continue;
        }

        MessageDocument? assistantMessage = null;
        try
        {
            var userMessage = await messages.AddUserMessageAsync(chatId, AppConstants.DefaultUserId, content, context.RequestAborted);
            await chats.UpdateTitleIfDefaultAsync(chatId, AppConstants.DefaultUserId, content, context.RequestAborted);
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.UserMessageSaved, messageId = userMessage.Id, status = userMessage.Status }, context.RequestAborted);

            var history = await messages.GetMessagesAsync(chatId, AppConstants.DefaultUserId, context.RequestAborted);
            assistantMessage = await messages.CreateAssistantMessageAsync(chatId, AppConstants.DefaultUserId, context.RequestAborted);
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.AssistantStarted, messageId = assistantMessage.Id, status = assistantMessage.Status }, context.RequestAborted);

            var responseContent = new StringBuilder();
            var responseThinking = new StringBuilder();

            await foreach (var ollamaEvent in ollama.StreamChatAsync(history, context.RequestAborted))
            {
                if (ollamaEvent.Type == OllamaChatEvent.ThinkingDelta)
                {
                    responseThinking.Append(ollamaEvent.Content);
                    await SendJsonAsync(socket, new { type = WebSocketEventTypes.AssistantThinkingDelta, messageId = assistantMessage.Id, content = ollamaEvent.Content }, context.RequestAborted);
                    continue;
                }

                if (ollamaEvent.Type == OllamaChatEvent.ContentDelta)
                {
                    responseContent.Append(ollamaEvent.Content);
                    await SendJsonAsync(socket, new { type = WebSocketEventTypes.AssistantDelta, messageId = assistantMessage.Id, content = ollamaEvent.Content }, context.RequestAborted);
                    continue;
                }
            }

            var thinking = responseThinking.Length == 0 ? null : responseThinking.ToString();
            await messages.CompleteAssistantMessageAsync(assistantMessage.Id, responseContent.ToString(), thinking, context.RequestAborted);
            await SendJsonAsync(socket, new { type = WebSocketEventTypes.AssistantComplete, messageId = assistantMessage.Id, status = MessageStatuses.Complete }, context.RequestAborted);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Chat generation failed for chat {ChatId}", chatId);
            if (assistantMessage is not null)
            {
                await messages.MarkAssistantMessageFailedAsync(assistantMessage.Id, CancellationToken.None);
            }

            if (socket.State == WebSocketState.Open)
            {
                await SendJsonAsync(socket, new { type = WebSocketEventTypes.Error, message = "Unable to get response from the model." }, CancellationToken.None);
            }
        }
    }
}

static async Task<string> ReceiveTextAsync(WebSocket socket, CancellationToken cancellationToken)
{
    var buffer = new byte[4096];
    using var stream = new MemoryStream();

    while (true)
    {
        var result = await socket.ReceiveAsync(buffer, cancellationToken);
        if (result.MessageType == WebSocketMessageType.Close)
        {
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", cancellationToken);
            return string.Empty;
        }

        stream.Write(buffer, 0, result.Count);
        if (result.EndOfMessage)
        {
            break;
        }
    }

    return Encoding.UTF8.GetString(stream.ToArray());
}

static Task SendJsonAsync(WebSocket socket, object payload, CancellationToken cancellationToken)
{
    var json = JsonSerializer.Serialize(payload, AppJson.Options);
    var bytes = Encoding.UTF8.GetBytes(json);
    return socket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
}

static ChatResponse ToChatResponse(ChatDocument chat)
{
    return new ChatResponse(chat.Id, chat.Title, chat.CreatedAt, chat.UpdatedAt);
}

static MessageResponse ToMessageResponse(MessageDocument message)
{
    return new MessageResponse(message.Id, message.ChatId, message.Role, message.Content, message.Thinking, message.CreatedAt, message.Status, message.Order);
}

public sealed record RenameChatRequest(string Title);

public sealed record ChatResponse(string Id, string Title, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record MessageResponse(string Id, string ChatId, string Role, string Content, string? Thinking, DateTime CreatedAt, string Status, int Order);
