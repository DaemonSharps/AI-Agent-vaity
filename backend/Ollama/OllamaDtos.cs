using System.Text.Json.Serialization;

namespace Api.Ollama;

public sealed class OllamaChatRequest
{
    [JsonPropertyName("model")]
    public string Model { get; init; } = string.Empty;

    [JsonPropertyName("messages")]
    public IReadOnlyList<OllamaMessage> Messages { get; init; } = [];

    [JsonPropertyName("stream")]
    public bool Stream { get; init; }

    [JsonPropertyName("think")]
    public bool Think { get; init; }

    [JsonPropertyName("options")]
    public OllamaRequestOptions Options { get; init; } = new();
}

public sealed class OllamaRequestOptions
{
    [JsonPropertyName("num_ctx")]
    public int NumContext { get; init; }

    [JsonPropertyName("num_predict")]
    public int NumPredict { get; init; }

    [JsonPropertyName("temperature")]
    public double Temperature { get; init; }

    [JsonPropertyName("top_p")]
    public double TopP { get; init; }

    [JsonPropertyName("top_k")]
    public int TopK { get; init; }
}

public sealed class OllamaMessage
{
    [JsonPropertyName("role")]
    public string Role { get; init; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;
}

public sealed class OllamaChatResponse
{
    [JsonPropertyName("message")]
    public OllamaResponseMessage? Message { get; init; }

    [JsonPropertyName("done")]
    public bool Done { get; init; }
}

public sealed class OllamaResponseMessage
{
    [JsonPropertyName("content")]
    public string? Content { get; init; }

    [JsonPropertyName("thinking")]
    public string? Thinking { get; init; }
}
