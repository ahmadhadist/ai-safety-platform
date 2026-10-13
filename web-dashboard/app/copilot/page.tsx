"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, ShieldCheck, Sparkles, AlertTriangle, Copy, Check, Database } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";

type ToolCall = { name: string; args: Record<string, unknown> };

type Message = {
  role: "user" | "ai";
  content: string;
  toolCalls?: ToolCall[];
  model?: string;
};


// KOMPONEN EFEK MENGETIK STREAMING (SIMULASI)
const TypewriterMarkdown = ({ content, onComplete }: { content: string, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    // Reset saat konten baru
    setDisplayedText("");
    setIsTyping(true);
    let i = 0;
    
    // Kecepatan ketik: 10-25ms per karakter agar terlihat natural dan cepat (Flash speed)
    const typingInterval = setInterval(() => {
      setDisplayedText((prev) => {
        const nextChar = content.substring(0, i + 1);
        return nextChar;
      });
      i++;
      
      if (i >= content.length) {
        clearInterval(typingInterval);
        setIsTyping(false);
        if (onComplete) onComplete();
      }
    }, 15); // ms per karakter

    return () => clearInterval(typingInterval);
  }, [content]);

  return (
    <>
      <ReactMarkdown
        components={{
          h3: ({ node, ...props }) => (
            <div className="flex items-center gap-2 font-bold text-slate-900 text-base mt-4 mb-2 pb-1 border-b border-slate-100">
              <span className="text-blue-600">📌</span>
              <span {...props} />
            </div>
          ),
          p: ({ node, ...props }) => <p className="my-1.5 leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="my-2 space-y-1.5 pl-4 list-disc marker:text-blue-500" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-2 space-y-1.5 pl-5 list-decimal marker:font-bold marker:text-blue-600" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-slate-900 bg-slate-100/80 px-1 py-0.5 rounded" {...props} />,
          hr: () => <hr className="my-4 border-slate-200" />,
          blockquote: ({ node, ...props }) => (
            <div className="p-3.5 my-2.5 bg-amber-50 border-l-4 border-amber-500 text-amber-900 rounded-r-lg text-xs">
              <blockquote {...props} />
            </div>
          )
        }}
      >
        {displayedText}
      </ReactMarkdown>
      {isTyping && <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse align-middle"></span>}
    </>
  );
};

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content: "Hi! I'm your **EHS AI Co-Pilot**. I query your **live inspection history, safety policies and uploaded SOPs** before I answer, and I show you which data I used.\n\nAsk me about hotspots, trends, a policy, or an emergency procedure."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [language, setLanguage] = useState("en");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    "📈 Which location is our biggest risk in the last 14 days?",
    "🚨 Summarise this week's critical violations",
    "🛠️ What PPE does our Working at Height policy require?",
    "🧪 Emergency procedure for an ammonia leak"
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const sendMessage = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: textToSend.trim() }]);
    setIsLoading(true);

    try {
      const res = await api.post("/copilot/chat", { 
        message: textToSend.trim(),
        language: language 
      });
      setMessages(prev => [...prev, { role: "ai", content: res.data.reply, toolCalls: res.data.tool_calls, model: res.data.model_used }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "ai", content: "⚠️ Maaf, terjadi kendala saat menghubungi server AI." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-[86vh] flex flex-col space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm">
              <Bot size={22} />
            </span>
            EHS AI Co-Pilot
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            An agent that queries your <b>live inspection data, policies and SOPs</b> with Gemini function calling.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-xs font-medium shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Gemini · Function Calling</span>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Messages Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/70">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {/* Avatar AI */}
              {msg.role === 'ai' && (
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                  <Bot size={18} />
                </div>
              )}

              {/* Chat Bubble */}
              <div className={`group relative max-w-[85%] rounded-2xl text-sm leading-relaxed shadow-sm transition-all ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white px-5 py-3.5 rounded-tr-none font-medium' 
                  : 'bg-white text-slate-800 border border-slate-200/90 px-6 py-5 rounded-tl-none'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="space-y-3 prose-sm max-w-none text-slate-700">
                    {/* Agent reasoning trail: which live-database tools Gemini decided to call */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-100">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Agent queried</span>
                        {msg.toolCalls.map((tc, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Database size={11} />
                            {tc.name}({Object.entries(tc.args || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
                          </span>
                        ))}
                        {msg.model && <span className="text-[10px] text-slate-400 ml-auto">{msg.model}</span>}
                      </div>
                    )}
                    <TypewriterMarkdown 
                      content={msg.content} 
                      onComplete={() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }} 
                    />

                    {/* Copy Button */}
                    <div className="pt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md transition-colors"
                      >
                        {copiedIdx === idx ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        {copiedIdx === idx ? "Tersalin!" : "Salin Teks"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar User */}
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                  <User size={18} />
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot size={18} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-5 py-3.5 shadow-sm flex items-center gap-2">
                <Sparkles size={16} className="text-blue-500 animate-spin" />
                <span className="text-xs text-slate-500 font-medium">Gemini AI is reasoning safety data...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 pt-3 pb-1 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto text-xs">
          {quickPrompts.map((prompt, pIdx) => (
            <button
              key={pIdx}
              onClick={() => sendMessage(prompt)}
              disabled={isLoading}
              className="whitespace-nowrap px-3 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-full text-slate-600 transition-all font-medium"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white">
          <div className="flex gap-2.5">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-3 text-slate-700 text-sm focus:border-blue-500 font-medium cursor-pointer"
              disabled={isLoading}
            >
              <option value="id">🇮🇩 ID</option>
              <option value="en">🇬🇧 EN</option>
              <option value="ja">🇯🇵 JA</option>
            </select>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about hotspots, trends, policies or emergency steps..."
              className="flex-1 bg-slate-100/90 border border-slate-200/80 outline-none rounded-xl px-5 py-3 text-slate-800 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              disabled={isLoading}
            />
            <button 
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 rounded-xl transition-colors flex items-center justify-center shadow-sm font-medium"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="mt-2 text-center text-[11px] text-slate-400 flex justify-center items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" /> 
            Site-specific answers come from live database tools; general guidance follows OSHA / ISO 45001 practice.
          </div>
        </div>
      </div>
    </div>
  );
}
