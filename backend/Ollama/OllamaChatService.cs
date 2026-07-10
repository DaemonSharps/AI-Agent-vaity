using System.Runtime.CompilerServices;
using System.Text.Json;
using Api.Data;
using Api.Options;
using Api.WebSockets;
using Microsoft.Extensions.Options;

namespace Api.Ollama;

public sealed class OllamaChatService(IOllamaApi api, IOptions<OllamaOptions> options)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async IAsyncEnumerable<OllamaChatEvent> StreamChatAsync(
        IReadOnlyCollection<MessageDocument> history,
        ChatMode mode,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var ollamaOptions = options.Value;
        var request = new OllamaChatRequest
        {
            Model = ollamaOptions.Model,
            Stream = ollamaOptions.UseStream,
            Think = mode == ChatMode.Thinking,
            Messages = history
                .Where(message => message.Status is MessageStatuses.Sent or MessageStatuses.Complete)
                .Where(message => message.Role is MessageRoles.User or MessageRoles.Assistant)
                .Select(message => new OllamaMessage { Role = message.Role, Content = message.Content })
                .ToList()
        };

        using var response = await api.ChatAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException($"Ollama /api/chat failed with {(int)response.StatusCode}: {errorBody}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var chunk = JsonSerializer.Deserialize<OllamaChatResponse>(line, JsonOptions);
            if (chunk is null)
            {
                continue;
            }

            if (!string.IsNullOrEmpty(chunk.Message?.Thinking))
            {
                yield return new OllamaChatEvent(OllamaChatEvent.ThinkingDelta, chunk.Message.Thinking);
            }

            if (!string.IsNullOrEmpty(chunk.Message?.Content))
            {
                yield return new OllamaChatEvent(OllamaChatEvent.ContentDelta, chunk.Message.Content);
            }

            if (chunk.Done)
            {
                yield return new OllamaChatEvent(OllamaChatEvent.Complete, string.Empty);
            }
        }
    }
}
