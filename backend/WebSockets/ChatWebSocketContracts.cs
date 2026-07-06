using System.Text.Json.Serialization;

namespace Api.WebSockets;

public sealed class ClientChatMessage
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;
}

public static class WebSocketEventTypes
{
    public const string UserMessage = "user_message";
    public const string UserMessageSaved = "user_message_saved";
    public const string AssistantStarted = "assistant_started";
    public const string AssistantThinkingDelta = "assistant_thinking_delta";
    public const string AssistantDelta = "assistant_delta";
    public const string AssistantComplete = "assistant_complete";
    public const string Error = "error";
}
