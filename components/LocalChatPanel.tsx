"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

type StreamChunk = {
  choices?: { delta?: { content?: string } }[];
};

type ChatTranscript = {
  id: string;
  createdAt: string;
  messages: ChatMessage[];
};

export function LocalChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTranscript[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem("local-chat:state");
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        messages?: ChatMessage[];
        input?: string;
        history?: ChatTranscript[];
      } | null;
      if (parsed?.messages && Array.isArray(parsed.messages)) {
        setMessages(parsed.messages);
      }
      if (typeof parsed?.input === "string") {
        setInput(parsed.input);
      }
      if (parsed?.history && Array.isArray(parsed.history)) {
        setHistory(parsed.history);
      }
    } catch {
      // ignore invalid stored state
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const payload = JSON.stringify({ messages, input, history });
      window.localStorage.setItem("local-chat:state", payload);
    } catch {
      // ignore persistence errors
    }
  }, [messages, input, history]);

  const handleNewChat = () => {
    if (messages.length > 0) {
      const createdAt = new Date().toISOString();
      const transcript: ChatTranscript = {
        id: createdAt,
        createdAt,
        messages,
      };
      setHistory((current) => [transcript, ...current].slice(0, 20));
    }
    setMessages([]);
    setInput("");
    setPendingImage(null);
    setError(null);
    setIsFlashing(true);
    window.setTimeout(() => {
      setIsFlashing(false);
    }, 180);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
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

    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);

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

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        setError(text || response.statusText || "Request failed");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith("data:")) {
              continue;
            }
            const data = line.slice("data:".length).trim();
            if (data === "[DONE]") {
              done = true;
              break;
            }
            try {
              const parsed = JSON.parse(data) as StreamChunk;
              const delta =
                parsed.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                setMessages((current) =>
                  current.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: (m.content ?? "") + delta }
                      : m
                  )
                );
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    } catch (err) {
      console.error("Local chat request failed", err);
      setError("Erro ao falar com o modelo local.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-end bg-slate-100 dark:bg-slate-950">
      <div
        className={`mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-24 transition-colors ${
          isFlashing
            ? "bg-sky-50/70 dark:bg-slate-800/70"
            : "bg-transparent"
        }`}
      >
        <div className="mb-4 text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
          Travis local
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
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    <ReactMarkdown className="whitespace-pre-wrap break-words">
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Histórico de chats
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {history.map((session) => {
                const date = new Date(session.createdAt);
                const preview =
                  session.messages.find((m) => m.role === "user")
                    ?.content ?? "Conversa anterior";
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setMessages(session.messages);
                      setInput("");
                      setPendingImage(null);
                      setError(null);
                    }}
                    className="flex w-full items-start justify-between gap-2 rounded-md border border-slate-200 px-2 py-1 text-left hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:hover:border-sky-500 dark:hover:bg-slate-800"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {date.toLocaleString()}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-slate-700 dark:text-slate-100">
                        {preview}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Excluir chat"
                      onClick={(event) => {
                        event.stopPropagation();
                        setHistory((current) =>
                          current.filter((item) => item.id !== session.id)
                        );
                      }}
                      className="ml-1 rounded-md border border-transparent px-1 py-0.5 text-[11px] text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
                    >
                      apagar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="rounded-lg border border-dashed border-slate-400 px-2 py-1 hover:border-sky-500">
                  Anexar imagem
                </span>
                <input
                  suppressHydrationWarning
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            </div>
            {pendingImage && (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
                  <img
                    src={pendingImage}
                    alt="Pré-visualização"
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-500"
                >
                  Remover imagem
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={
                isSending || (messages.length === 0 && !input && !pendingImage)
              }
              aria-label="Novo chat"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-xl font-bold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500"
            >
              +
            </button>
            <input
              suppressHydrationWarning
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                pendingImage
                  ? "Adicione uma instrução sobre a imagem (opcional)..."
                  : "Pergunte algo ou envie só a imagem..."
              }
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
