'use client';
import { useState, useRef, useEffect } from 'react';

export default function ChatBox() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // 聊天记录本地持久化（刷新不丢）
  useEffect(() => {
    const saved = localStorage.getItem('chat-history');
    if (saved) setMessages(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-history', JSON.stringify(messages));
  }, [messages]);

  // 上传 TXT
  const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setKnowledge(evt.target?.result as string);
      alert('TXT 上传成功！');
    };
    reader.readAsText(file);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    // 🔥 固定用 CDN 稳定版本，绝对不会 404
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 正确格式
    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;

    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }

    setKnowledge(text);
    alert('PDF 解析成功！');
  } catch (err) {
    console.error(err);
    alert('PDF解析失败');
  }
};

  // 发送消息
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimInput = input.trim();
    if (!trimInput) return;

    const userMessage = { role: 'user', content: trimInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: newMessages,
        knowledge: knowledge,
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let aiContent = '';

    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
            aiContent += content;
            setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
          }
        } catch {}
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 h-screen flex flex-col gap-4">
      <div className="flex gap-3">
        <input type="file" accept=".txt" ref={fileInputRef} onChange={handleTxtUpload} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="bg-green-600 text-white px-4 py-2 rounded-lg">
          上传TXT
        </button>

        <input type="file" accept=".pdf" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" />
        <button onClick={() => pdfInputRef.current?.click()} className="bg-red-600 text-white px-4 py-2 rounded-lg">
          上传PDF
        </button>

        {knowledge && <span className="text-green-600">✅ 文档已加载</span>}
      </div>

      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
        {messages.map((msg, index) => (
          <div key={index} className={`max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'} mb-3`}>
            <div className={`p-3 rounded-xl text-sm ${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          className="flex-1 border border-gray-300 rounded-xl p-3 outline-none"
        />
        <button type="submit" className="bg-blue-500 text-white px-5 py-3 rounded-xl">发送</button>
      </form>
    </div>
  );
}