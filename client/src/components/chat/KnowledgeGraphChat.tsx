import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, User, Bot, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface KnowledgeGraphChatProps {
  recordingId?: number;
}

export function KnowledgeGraphChat({ recordingId }: KnowledgeGraphChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Initialize or fetch conversation
  useEffect(() => {
    const initChat = async () => {
      try {
        // 1. Check if a conversation already exists for this recording
        const fetchRes = await fetch(`/api/conversations?recordingId=${recordingId}`);
        if (fetchRes.ok) {
          const chats = await fetchRes.json();
          if (chats.length > 0) {
            const existingChat = chats[0];
            setConversationId(existingChat.id);
            // 2. Fetch the message history
            const historyRes = await fetch(`/api/conversations/${existingChat.id}`);
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              if (historyData.messages) {
                setMessages(historyData.messages);
              }
            }
            return;
          }
        }
        
        // 3. Otherwise, create a new one
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `KG Chat - Rec ${recordingId || 'General'}`, recordingId })
        });
        if (!res.ok) throw new Error('Failed to init conversation');
        const data = await res.json();
        setConversationId(data.id);
      } catch (err) {
        console.error('Chat init error:', err);
      }
    };
    initChat();
  }, [recordingId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMessage, recordingId }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      // Setup streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantMessage += data.content;
                  setMessages(prev => {
                    const last = prev[prev.length - 1];
                    const others = prev.slice(0, -1);
                    return [...others, { role: 'assistant', content: assistantMessage }];
                  });
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Chat Error",
        description: "Failed to get a response from the knowledge graph. Please try again.",
      });
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-full border-l-0 rounded-l-none border-y-0 rounded-none shadow-none bg-background/50">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          Knowledge Assistant
        </CardTitle>
      </CardHeader>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Ask me anything about this lecture!</p>
              <p className="text-xs">I only use facts from your knowledge graph.</p>
            </div>
          )}
          
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border'
              }`}>
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                m.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-none' 
                  : 'bg-card border border-border rounded-tl-none'
              }`}>
                {m.content || (isLoading && i === messages.length - 1 ? (
                  <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                ) : null)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <Input
            placeholder="What was the main topic?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </Card>
  );
}
