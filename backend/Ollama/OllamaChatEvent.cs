namespace Api.Ollama;

public sealed record OllamaChatEvent(string Type, string Content, IReadOnlyList<int>? Context = null)
{
    public const string ContentDelta = "content_delta";
    public const string ThinkingDelta = "thinking_delta";
    public const string Complete = "complete";
}
