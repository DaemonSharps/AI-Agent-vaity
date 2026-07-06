using Api.Data;

namespace Api.Repositories;

public interface IMessageRepository
{
    Task<IReadOnlyList<MessageDocument>> GetMessagesAsync(string chatId, string userId, CancellationToken cancellationToken);

    Task<MessageDocument> AddUserMessageAsync(string chatId, string userId, string content, CancellationToken cancellationToken);

    Task<MessageDocument> CreateAssistantMessageAsync(string chatId, string userId, CancellationToken cancellationToken);

    Task CompleteAssistantMessageAsync(string messageId, string content, string? thinking, CancellationToken cancellationToken);

    Task MarkAssistantMessageFailedAsync(string messageId, CancellationToken cancellationToken);
}
