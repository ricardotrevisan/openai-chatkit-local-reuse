export class SerperClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.SERPER_API_KEY ?? "";
    this.baseUrl = (process.env.SERPER_BASE_URL ?? "").replace(/\/$/, "");
    this.timeout = Number(process.env.SEARCH_TIMEOUT ?? 20);

    if (!this.apiKey) throw new Error("SERPER_API_KEY não configurado.");
    if (!this.baseUrl) throw new Error("SERPER_BASE_URL não configurado.");
  }

  async search(query: string, maxResults: number) {
    const payload = {
      q: query,
      num: maxResults,
    };

    const res = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    if (!res.ok) {
      throw new Error(`Serper error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return (data.organic ?? []).slice(0, maxResults).map((item: any) => ({
      title: item.title ?? "",
      url: item.link ?? item.url ?? "",
      snippet: item.snippet ?? item.description ?? "",
    }));
  }
}
