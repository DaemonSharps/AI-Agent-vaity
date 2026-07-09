using MongoDB.Bson.Serialization.Attributes;

namespace Api.Data;

public sealed class ChatDocument
{
    [BsonId]
    public string Id { get; init; } = string.Empty;

    public string UserId { get; init; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public DateTime CreatedAt { get; init; }

    public DateTime UpdatedAt { get; set; }
}
