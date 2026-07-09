using Api.Options;
using Microsoft.Extensions.Options;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;

namespace Api.Data;

public sealed class MongoDbContext
{
    static MongoDbContext()
    {
        var conventionPack = new ConventionPack
        {
            new IgnoreExtraElementsConvention(true)
        };

        ConventionRegistry.Register(
            "Ignore extra elements for MongoDB documents",
            conventionPack,
            type => type.Namespace == typeof(MongoDbContext).Namespace && type.Name.EndsWith("Document", StringComparison.Ordinal));
    }

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
