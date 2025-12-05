"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

type ChoiceMessage = {
  role: string;
  content: string;
};

type ChatCompletionResponse = {
  choices?: { message?: ChoiceMessage }[];
  error?: { message?: string } | string;
};

export function LocalChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
   const [pendingImage, setPendingImage] = useState<string | null>(null);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPendingImage(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setPendingImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && !pendingImage) {
      return;
    }

    if (isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      imageDataUrl: pendingImage ?? undefined,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPendingImage(null);
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Ministral-3-8B-Reasoning-2512",
          messages: messages.concat(userMessage).map((m) => {
            if (m.role === "user" && m.imageDataUrl) {
              const parts = [];
              if (m.content) {
                parts.push({ type: "text", text: m.content });
              }
              parts.push({
                type: "image_url",
                image_url: { url: m.imageDataUrl },
              });
              return {
                role: "user",
                content: parts,
              };
            }
            return {
              role: m.role,
              content: m.content,
            };
          }),
        } as const),
      });

      const text = await response.text();

      let data: ChatCompletionResponse | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as ChatCompletionResponse;
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const detail =
          (typeof data?.error === "string"
            ? data.error
            : data?.error && "message" in data.error
            ? (data.error as { message?: string }).message
            : null) ??
          response.statusText;
        setError(detail || "Request failed");
        return;
      }

      const content =
        data?.choices?.[0]?.message?.content?.trim() ||
        "Sem resposta do modelo.";

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      console.error("Local chat request failed", err);
      setError("Erro ao falar com o modelo local.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-end bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="mb-4 text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assistente local
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {messages.length === 0 && (
            <p className="text-center text-slate-400">
              Faça uma pergunta para começar.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-3 flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div className="flex max-w-[80%] flex-col gap-1">
                {message.imageDataUrl && (
                  <div
                    className={`overflow-hidden rounded-2xl border ${
                      message.role === "user"
                        ? "border-sky-500"
                        : "border-slate-700"
                    }`}
                  >
                    <img
                      src={message.imageDataUrl}
                      alt="Imagem enviada"
                      className="max-h-64 w-full object-contain"
                    />
                  </div>
                )}
                {message.content && (
                  <div
                    className={`rounded-2xl px-3 py-2 ${
                      message.role === "user"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {message.content}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="rounded-lg border border-dashed border-slate-400 px-2 py-1 hover:border-sky-500">
                Anexar imagem
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
            {pendingImage && (
              <span className="text-xs text-slate-500 dark:text-slate-300">
                Imagem selecionada
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte algo ou envie só a imagem..."
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={isSending || (!input.trim() && !pendingImage)}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
