import { NextRequest } from "next/server";

const LOCAL_CHAT_URL = "http://127.0.0.1:8080/v1/chat/completions";

type UpstreamContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | Record<string, unknown>;

type UpstreamMessage = {
  role: "system" | "user" | "assistant";
  content: string | UpstreamContentPart[];
};

const SYSTEM_MESSAGE: UpstreamMessage = {
  role: "system",
  content:
    "Você é direto, objetivo e não divaga. Responda sempre claro, de forma curta, exceto quando o usuário pedir profundidade.",
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          messages?: UpstreamMessage[];
          model?: string;
        }
      | null;

    const messages = body?.messages ?? [];
    const model = body?.model ?? "Ministral-3-8B-Reasoning-2512";

    const upstreamResponse = await fetch(LOCAL_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [SYSTEM_MESSAGE, ...messages],
        stream: false,
      }),
    });

    const text = await upstreamResponse.text();

    return new Response(text || "{}", {
      status: upstreamResponse.status,
      headers: {
        "Content-Type":
          upstreamResponse.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Local chat route error", error);
    return new Response(
      JSON.stringify({
        error: "Failed to call local chat backend",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
