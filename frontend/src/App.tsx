import { useEffect, useState } from 'react';

type WeatherForecast = {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export default function App() {
  const [forecast, setForecast] = useState<WeatherForecast[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/weather`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}`);
        }

        return response.json() as Promise<WeatherForecast[]>;
      })
      .then(setForecast)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Failed to load weather');
      });
  }, []);

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">.NET 9 Minimal API + Vite</p>
        <h1>React frontend connected to a small API</h1>
        <p className="subtitle">
          Start the backend and frontend locally, or build both with their Dockerfiles.
        </p>
      </section>

      <section className="card">
        <h2>Weather forecast</h2>
        {error ? <p className="error">{error}</p> : null}
        {!error && forecast.length === 0 ? <p>Loading...</p> : null}
        <div className="forecast-grid">
          {forecast.map((item) => (
            <article className="forecast-card" key={item.date}>
              <strong>{item.summary}</strong>
              <span>{item.date}</span>
              <span>{item.temperatureC}°C / {item.temperatureF}°F</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
