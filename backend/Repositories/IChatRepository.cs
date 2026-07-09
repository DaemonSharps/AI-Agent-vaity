using Api.Data;

namespace Api.Repositories;

public interface IChatRepository
{
    Task<IReadOnlyList<ChatDocument>> GetChatsAsync(string userId, CancellationToken cancellationToken);

    Task<ChatDocument?> GetChatAsync(string chatId, string userId, CancellationToken cancellationToken);

    Task<(ChatDocument? Chat, string? Error)> CreateChatAsync(string userId, CancellationToken cancellationToken);

    Task<ChatDocument?> RenameChatAsync(string chatId, string userId, string title, CancellationToken cancellationToken);

    Task<bool> DeleteChatAsync(string chatId, string userId, CancellationToken cancellationToken);

    Task UpdateTitleIfDefaultAsync(string chatId, string userId, string title, CancellationToken cancellationToken);
}
