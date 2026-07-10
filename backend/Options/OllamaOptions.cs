namespace Api.Options;

public sealed class OllamaOptions
{
    public const string SectionName = "Ollama";

    /// <summary>
    /// Базовый URL сервера Ollama, к которому обращается backend.
    /// Меняйте, если Ollama запущена на другом хосте, порту, в другом контейнере или окружении.
    /// </summary>
    public string BaseUrl { get; init; } = string.Empty;

    /// <summary>
    /// Имя модели Ollama, которая используется для ответов в чате.
    /// Меняйте при переходе на другую загруженную модель или другой тег модели.
    /// </summary>
    public string Model { get; init; } = string.Empty;

    /// <summary>
    /// Включает потоковую передачу ответа от Ollama.
    /// Оставляйте включенным для постепенного отображения ответа в UI; выключайте только если нужен один полный ответ целиком.
    /// </summary>
    public bool UseStream { get; init; }

    /// <summary>
    /// Параметры генерации, которые передаются в Ollama в объекте request options.
    /// Меняйте для настройки размера контекста, длины ответа, детерминированности и поведения sampling.
    /// </summary>
    public OllamaGenerationOptions Options { get; init; } = new();
}

public sealed class OllamaGenerationOptions
{
    /// <summary>
    /// Размер контекстного окна в токенах.
    /// Увеличивайте, чтобы модель учитывала больше истории чата; уменьшайте, чтобы снизить расход памяти и время обработки prompt.
    /// </summary>
    public int NumContext { get; init; }

    /// <summary>
    /// Максимальное количество токенов, которое модель может сгенерировать в ответе ассистента.
    /// Увеличивайте для более длинных ответов; уменьшайте, чтобы ответы были короче и генерировались быстрее.
    /// </summary>
    public int NumPredict { get; init; }

    /// <summary>
    /// Температура sampling, управляющая случайностью ответа.
    /// Меньшие значения делают ответы более детерминированными; большие значения делают их разнообразнее и креативнее.
    /// </summary>
    public double Temperature { get; init; }

    /// <summary>
    /// Порог nucleus sampling.
    /// Меньшие значения сильнее ограничивают выбор токенов и делают ответ более сфокусированным; большие значения дают больше вариативности.
    /// </summary>
    public double TopP { get; init; }

    /// <summary>
    /// Ограничивает sampling верхними K кандидатами токенов.
    /// Меньшие значения делают ответ консервативнее; большие значения расширяют возможный выбор токенов.
    /// </summary>
    public int TopK { get; init; }
}
