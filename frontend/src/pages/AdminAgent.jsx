"use client";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { debugAgent } from "@/api/functions";
import { Send, Bot, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

const API_BASE = '/api/lit';
function redactHeaders(headers) {
  const out = {};
  Object.entries(headers || {}).forEach(([k, v]) => {
    if (/authorization/i.test(k)) return;
    out[k] = String(v ?? "");
  });
  return out;
}

export default function AdminAgentPage() {
  const { user, loading } = useAuth();
  const [conversationId, setConversationId] = useState(undefined);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isAdmin = !!(user && (user.role === 'admin' || user.email === 'vraymond@sparkfusiondigital.com' || user.email === 'support@logisticintel.com'));
  const [diagLog, setDiagLog] = useState({});
  const [searchBody, setSearchBody] = useState('{' + '\n  "limit": 1,' + '\n  "offset": 0\n}');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

// Client-side auth gate only; no backend call needed

  async function hit(path, init, bodyObj) {
    const url = `${API_BASE}${path}`;
    const headers = { 'content-type': 'application/json' };
    const reqSnap = {
      url,
      method: (init && init.method) || 'GET',
      headers: redactHeaders(headers),
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    };
    try {
      const res = await fetch(url, {
        method: (init && init.method) || 'GET',
        headers,
        body: bodyObj ? JSON.stringify(bodyObj) : undefined,
      });
      let body;
      try { body = await res.clone().json(); } catch { body = await res.clone().text(); }
      setDiagLog({ req: reqSnap, res: { status: res.status, ok: res.ok, body } });
    } catch (e) {
      setDiagLog({ req: reqSnap, res: { status: 0, ok: false, body: String((e && e.message) || e) } });
    }
  }

  const send = async () => {
    if (!input.trim()) return;
    
    const userMessage = { role: 'user', text: input };
    setMessages(m => [...m, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data } = await debugAgent({ conversationId, message: input });
      if (data.error) {
        alert(data.error);
        setMessages(m => m.filter(msg => msg !== userMessage));
      } else {
        setConversationId(data.conversationId);
        setMessages(m => [...m, { role:'assistant', text: data.reply }]);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.error || "An unexpected error occurred. Check the function logs.";
      alert(errorMessage);
      setMessages(m => m.filter(msg => msg !== userMessage));
    } finally {
      setIsLoading(false);
    }
  };

if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

if (!isAdmin) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
      <p className="text-gray-600">You need admin privileges to access the Debug Agent.</p>
    </div>
  );
}

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Debug Agent</h1>
        <p className="text-sm text-gray-500">Admin-only interface for debugging the platform.</p>
      </header>

      {/* System Diagnostic */}
      <div className="space-y-4 mb-6">
        <div className="rounded-xl border p-4 space-y-3 bg-white">
          <h2 className="text-lg font-medium">Initial Check: User Status</h2>
          {isAdmin ? (
            <div className="text-green-600">User loaded.</div>
          ) : (
            <div className="text-gray-500">Checking…</div>
          )}
        </div>

        <div className="rounded-xl border p-4 space-y-3 bg-white">
          <h2 className="text-lg font-medium">LIT Gateway Connection Test</h2>
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={() => hit('/public/status')}>Run LIT Gateway Test</button>
        </div>

        <div className="rounded-xl border p-4 space-y-3 bg-white">
          <h2 className="text-lg font-medium">Filter Options</h2>
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={() => hit('/public/getFilterOptions')}>Get Filter Options</button>
        </div>

        <div className="rounded-xl border p-4 space-y-3 bg-white">
          <h2 className="text-lg font-medium">Search Companies (editable body)</h2>
          <textarea className="w-full h-40 rounded-md border p-2 font-mono text-sm" value={searchBody} onChange={(e) => setSearchBody(e.target.value)} />
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 text-white"
              onClick={() => {
                let body = {};
                try { body = JSON.parse(searchBody); } catch { body = { limit:1, offset:0 }; }
                hit('/public/searchCompanies', { method: 'POST' }, body);
              }}
            >Run Search</button>
            <button
              className="px-3 py-2 rounded-lg border"
              onClick={() => setSearchBody(JSON.stringify({ limit: 1, offset: 0 }, null, 2))}
            >Reset Body</button>
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-3 bg-white">
          <h2 className="text-lg font-medium">Last Request / Response</h2>
          <pre className="text-xs bg-gray-50 rounded-md p-3 overflow-auto max-h-[50vh]">{JSON.stringify(diagLog, null, 2)}</pre>
        </div>
      </div>
      
      <div className="border rounded-lg p-4 h-[60vh] overflow-y-auto bg-white shadow-sm space-y-6 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={20} />
              </div>
            )}
            <div className={`rounded-xl p-3 px-4 max-w-2xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              <ReactMarkdown className="prose prose-sm max-w-none">
                {m.text}
              </ReactMarkdown>
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                <UserIcon size={20} />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center flex-shrink-0">
              <Bot size={20} />
            </div>
            <div className="rounded-xl p-4 bg-gray-100 text-gray-800">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div>
        <div className="flex gap-2">
          <Input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && !isLoading && send()}
            placeholder="Ask about a failing page or a bug…" 
            className="flex-1 text-base h-11"
            disabled={isLoading}
          />
          <Button onClick={send} disabled={isLoading} className="h-11">
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Agent has tools: Supabase read-only select/RPC + Search /healthz ping.</p>
      </div>
    </div>
  );
}