using Api.Data;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Api.Repositories;

public sealed class ChatRepository(MongoDbContext db) : IChatRepository
{
    private const string DefaultTitle = "New chat";

    public async Task<IReadOnlyList<ChatDocument>> GetChatsAsync(string userId, CancellationToken cancellationToken)
    {
        return await db.Chats
            .Find(chat => chat.UserId == userId)
            .SortByDescending(chat => chat.UpdatedAt)
            .Limit(AppConstants.MaxChats)
            .ToListAsync(cancellationToken);
    }

    public async Task<ChatDocument?> GetChatAsync(string chatId, string userId, CancellationToken cancellationToken)
    {
        return await db.Chats
            .Find(chat => chat.Id == chatId && chat.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(ChatDocument? Chat, string? Error)> CreateChatAsync(string userId, CancellationToken cancellationToken)
    {
        var count = await db.Chats.CountDocumentsAsync(chat => chat.UserId == userId, cancellationToken: cancellationToken);
        if (count >= AppConstants.MaxChats)
        {
            return (null, "Chat limit reached.");
        }

        var now = DateTime.UtcNow;
        var chat = new ChatDocument
        {
            Id = ObjectId.GenerateNewId().ToString(),
            UserId = userId,
            Title = DefaultTitle,
            CreatedAt = now,
            UpdatedAt = now
        };

        await db.Chats.InsertOneAsync(chat, cancellationToken: cancellationToken);
        return (chat, null);
    }

    public async Task<ChatDocument?> RenameChatAsync(string chatId, string userId, string title, CancellationToken cancellationToken)
    {
        var update = Builders<ChatDocument>.Update
            .Set(chat => chat.Title, title)
            .Set(chat => chat.UpdatedAt, DateTime.UtcNow);

        return await db.Chats.FindOneAndUpdateAsync(
            chat => chat.Id == chatId && chat.UserId == userId,
            update,
            new FindOneAndUpdateOptions<ChatDocument> { ReturnDocument = ReturnDocument.After },
            cancellationToken);
    }

    public async Task<bool> DeleteChatAsync(string chatId, string userId, CancellationToken cancellationToken)
    {
        var result = await db.Chats.DeleteOneAsync(chat => chat.Id == chatId && chat.UserId == userId, cancellationToken);
        if (result.DeletedCount == 0)
        {
            return false;
        }

        await db.Messages.DeleteManyAsync(message => message.ChatId == chatId && message.UserId == userId, cancellationToken);
        return true;
    }

    public async Task UpdateTitleIfDefaultAsync(string chatId, string userId, string title, CancellationToken cancellationToken)
    {
        var cleanTitle = title.Trim();
        if (cleanTitle.Length > 60)
        {
            cleanTitle = string.Concat(cleanTitle.AsSpan(0, 57), "...");
        }

        if (cleanTitle.Length == 0)
        {
            return;
        }

        var update = Builders<ChatDocument>.Update
            .Set(chat => chat.Title, cleanTitle)
            .Set(chat => chat.UpdatedAt, DateTime.UtcNow);

        await db.Chats.UpdateOneAsync(
            chat => chat.Id == chatId && chat.UserId == userId && chat.Title == DefaultTitle,
            update,
            cancellationToken: cancellationToken);
    }
}
