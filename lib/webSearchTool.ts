import { SerperClient } from "./serper";

const SEARCH_MAX_RESULTS = Number(process.env.SEARCH_MAX_RESULTS ?? 3);
const SEARCH_MAX_CHARS = Number(process.env.SEARCH_MAX_CHARS ?? 600);
const SERPER_MAX_RESULTS = 5;

const client = new SerperClient();

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export async function runWebSearch(query: string, maxResults: number) {
  const limit = Math.min(Math.max(maxResults, 1), SERPER_MAX_RESULTS);

  const results = await client.search(query, limit);

  const enriched = results.map((r: any) => ({
    title: r.title ?? "",
    url: r.link ?? r.url ?? "",
    snippet: r.snippet ?? r.description ?? "",
  }))


  return {
    query,
    results: enriched,
  };
}
