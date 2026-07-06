using MongoDB.Bson.Serialization.Attributes;

namespace Api.Data;

public sealed class MessageDocument
{
    [BsonId]
    public string Id { get; init; } = string.Empty;

    public string ChatId { get; init; } = string.Empty;

    public string UserId { get; init; } = string.Empty;

    public string Role { get; init; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    public string? Thinking { get; set; }

    public DateTime CreatedAt { get; init; }

    public string Status { get; set; } = string.Empty;

    public int Order { get; init; }
}
