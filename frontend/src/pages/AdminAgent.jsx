"use client";
import React, { useState, useEffect, useRef } from "react";
import { User } from "@/api/entities";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { debugAgent } from "@/api/functions";
import { Send, Bot, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

export default function AdminAgentPage() {
  const [conversationId, setConversationId] = useState(undefined);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await User.me();
        if (user && user.role === 'admin') {
          setIsAdmin(true);
        } else {
          navigate(createPageUrl('Dashboard'));
        }
      } catch (e) {
        navigate(createPageUrl('Dashboard'));
      }
    };
    checkAdmin();
  }, [navigate]);

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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Debug Agent</h1>
        <p className="text-sm text-gray-500">Admin-only interface for debugging the platform.</p>
      </header>
      
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