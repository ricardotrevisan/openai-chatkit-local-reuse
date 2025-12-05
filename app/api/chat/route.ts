import { NextRequest } from "next/server";
import { runWebSearch } from "@/lib/webSearchTool";

const LOCAL_CHAT_URL = "http://127.0.0.1:8080/v1/chat/completions";

type UpstreamContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | Record<string, unknown>;

interface UpstreamMessage {
  role: "system" | "user" | "assistant";
  content: string | UpstreamContentPart[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface WebSearchArgs {
  query: string;
  max_results?: number;
}

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Buscar rapidamente na web e retornar trechos curtos.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 3,
        },
      },
      required: ["query"],
    },
  },
} as const;

const SYSTEM_MESSAGE: UpstreamMessage = {
  role: "system",
  content: `Você é um assistente extremamente direto, objetivo e factual.

Você tem acesso a ferramentas (functions).  
Quando a pergunta do usuário envolver fatos reais, tempo, clima, localização, datas, eventos atualizados, estatísticas ou qualquer dado que possa mudar ao longo do tempo, você DEVE usar a ferramenta apropriada antes de responder.

Ferramenta disponível:
- web_search(query, max_results): busca na web e retorna dados recentes.

Regras obrigatórias (siga SEMPRE):
1. Se a pergunta envolver clima, previsão do tempo, resultados atuais, notícias, valores numéricos, estatísticas, datas, horários, preços, situações específicas, você DEVE usar web_search.
2. Quando decidir usar a ferramenta, retorne SOMENTE o tool_call no formato pedido. Não escreva mais nada.
3. Após receber a resposta da ferramenta (role=tool), elabore a resposta final de forma breve, clara e objetiva.
4. Nunca invente fatos. Nunca estimule, chute ou responda com suposições.  
   Se você não sabe, ou não tem certeza, use web_search.
5. Se o usuário apenas pedir opinião, análise ou algo interno ao modelo, responda diretamente.
6. Mantenha respostas 100% curtas, diretas e sem divagações.
7. Se utilizou a ferramenta, disponibilize as URLs quando disponíveis.
`,
  };

async function callLocalChat(payload: unknown) {
  const res = await fetch(LOCAL_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text || `Upstream chat backend error (${res.status} ${res.statusText})`
    );
  }

  return (await res.json().catch(() => null)) as any;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          messages?: UpstreamMessage[];
          model?: string;
        }
      | null;
    const messages: UpstreamMessage[] = body?.messages ?? [];
    const model = body?.model ?? "Ministral-3-8B-Reasoning-2512";

    // 1) First model call: allow it to decide whether to call tools
    const baseMessages: UpstreamMessage[] = [SYSTEM_MESSAGE, ...messages];

    const firstResponse = await callLocalChat({
      model,
      messages: baseMessages,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: "auto",
      stream: false,
    });

    const firstChoice = firstResponse?.choices?.[0];
    const firstMessage = firstChoice?.message ?? {};
    const rawToolCalls = (firstMessage as any).tool_calls;
    const toolCalls: ToolCall[] = Array.isArray(rawToolCalls)
      ? rawToolCalls
      : [];

    let finalContent: string = "";

    if (toolCalls.length === 0) {
      // No tools requested – just use the model's direct answer
      finalContent = String(firstMessage.content ?? "");
    } else {
      // 2) Execute tool calls (currently only web_search)
      console.log('Tool Calling');
      const toolMessages: any[] = [];

      for (const toolCall of toolCalls) {
        if (!toolCall || toolCall.type !== "function") {
          continue;
        }

        const name = toolCall.function?.name;
        const rawArgs = toolCall.function?.arguments ?? "{}";

        let parsedArgs: WebSearchArgs = { query: "" };
        try {
          parsedArgs = JSON.parse(rawArgs) as WebSearchArgs;
        } catch {
          // ignore parse error, fallback to empty query
        }

        if (name === "web_search" && parsedArgs.query) {
          const query = parsedArgs.query;
          const maxResults = parsedArgs.max_results ?? 3;
          const result = await runWebSearch(query, maxResults);

          toolMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(result),
          });
        }
      }

      // 3) Second model call: give it the tool results so it can answer
      const secondResponse = await callLocalChat({
        model,
        messages: baseMessages.concat([firstMessage, ...toolMessages]),
        tool_choice: "none",
      });

      const secondChoice = secondResponse?.choices?.[0];
      const secondMessage = secondChoice?.message ?? {};
      finalContent = String(secondMessage.content ?? "");
    }

    // Stream the final answer back as SSE, compatible with the existing client
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (data: string) =>
          controller.enqueue(encoder.encode(data));

        if (finalContent) {
          const chunk = JSON.stringify({
            choices: [{ delta: { content: finalContent } }],
          });
          enqueue(`data: ${chunk}\n\n`);
        }

        enqueue("data: [DONE]\n\n");
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
