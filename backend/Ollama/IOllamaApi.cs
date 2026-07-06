using Refit;

namespace Api.Ollama;

public interface IOllamaApi
{
    [Post("/api/chat")]
    Task<HttpResponseMessage> ChatAsync([Body] OllamaChatRequest request, CancellationToken cancellationToken);
}
