using Api.Options;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Api.Data;

public sealed class MongoDbContext
{
    public MongoDbContext(IOptions<MongoDbOptions> options)
    {
        var mongoOptions = options.Value;
        var client = new MongoClient(mongoOptions.ConnectionString);
        var database = client.GetDatabase(mongoOptions.DatabaseName);

        Chats = database.GetCollection<ChatDocument>("chats");
        Messages = database.GetCollection<MessageDocument>("messages");
    }

    public IMongoCollection<ChatDocument> Chats { get; }

    public IMongoCollection<MessageDocument> Messages { get; }
}
