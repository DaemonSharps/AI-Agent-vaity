using Api.Data;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Api.Repositories;

public sealed class MessageRepository(MongoDbContext db) : IMessageRepository
{
    public async Task<IReadOnlyList<MessageDocument>> GetMessagesAsync(string chatId, string userId, CancellationToken cancellationToken)
    {
        return await db.Messages
            .Find(message => message.ChatId == chatId && message.UserId == userId)
            .SortBy(message => message.Order)
            .ToListAsync(cancellationToken);
    }

    public async Task<MessageDocument> AddUserMessageAsync(string chatId, string userId, string content, CancellationToken cancellationToken)
    {
        var message = new MessageDocument
        {
            Id = ObjectId.GenerateNewId().ToString(),
            ChatId = chatId,
            UserId = userId,
            Role = MessageRoles.User,
            Content = content,
            CreatedAt = DateTime.UtcNow,
            Status = MessageStatuses.Sent,
            Order = await GetNextOrderAsync(chatId, userId, cancellationToken)
        };

        await db.Messages.InsertOneAsync(message, cancellationToken: cancellationToken);
        return message;
    }

    public async Task<MessageDocument> CreateAssistantMessageAsync(string chatId, string userId, CancellationToken cancellationToken)
    {
        var message = new MessageDocument
        {
            Id = ObjectId.GenerateNewId().ToString(),
            ChatId = chatId,
            UserId = userId,
            Role = MessageRoles.Assistant,
            Content = string.Empty,
            CreatedAt = DateTime.UtcNow,
            Status = MessageStatuses.Streaming,
            Order = await GetNextOrderAsync(chatId, userId, cancellationToken)
        };

        await db.Messages.InsertOneAsync(message, cancellationToken: cancellationToken);
        return message;
    }

    public async Task CompleteAssistantMessageAsync(string messageId, string content, string? thinking, CancellationToken cancellationToken)
    {
        var update = Builders<MessageDocument>.Update
            .Set(message => message.Content, content)
            .Set(message => message.Thinking, thinking)
            .Set(message => message.Status, MessageStatuses.Complete);

        await db.Messages.UpdateOneAsync(message => message.Id == messageId, update, cancellationToken: cancellationToken);
    }

    public async Task MarkAssistantMessageFailedAsync(string messageId, CancellationToken cancellationToken)
    {
        var update = Builders<MessageDocument>.Update.Set(message => message.Status, MessageStatuses.Failed);
        await db.Messages.UpdateOneAsync(message => message.Id == messageId, update, cancellationToken: cancellationToken);
    }

    private async Task<int> GetNextOrderAsync(string chatId, string userId, CancellationToken cancellationToken)
    {
        var latestMessage = await db.Messages
            .Find(message => message.ChatId == chatId && message.UserId == userId)
            .SortByDescending(message => message.Order)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken);

        return latestMessage is null ? 1 : latestMessage.Order + 1;
    }
}
