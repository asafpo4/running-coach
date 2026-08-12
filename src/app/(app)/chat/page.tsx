"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/coach/chat")
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setError("Couldn't load chat history."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    const optimisticUserMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: `coach-${Date.now()}`, role: "coach", content: data.reply },
      ]);
    } catch {
      setError("The coach didn't answer. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-73px)] max-w-2xl flex-col px-4 py-6">
      <h1 className="text-xl font-bold">Coach Chat</h1>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-black/10 p-4">
        {loading && <p className="text-sm text-black/40">Loading…</p>}

        {!loading && messages.length === 0 && (
          <p className="text-sm text-black/40">
            Say hi. The coach already has opinions.
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-black text-white"
                  : "bg-black/5 text-black"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-black/5 px-3 py-2 text-sm text-black/40">
              typing…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={sendMessage} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the coach your excuse for today…"
          className="flex-1 rounded-md border border-black/10 px-3 py-2"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
