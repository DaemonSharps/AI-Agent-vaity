namespace Api.Options;

public sealed class OllamaOptions
{
    public const string SectionName = "Ollama";

    public string BaseUrl { get; init; } = string.Empty;

    public string Model { get; init; } = string.Empty;

    public bool UseStream { get; init; }

    public bool UseThink { get; init; }
}
