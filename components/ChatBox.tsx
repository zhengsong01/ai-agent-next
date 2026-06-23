'use client';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatBox() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      const pdfjs = await import('pdfjs-dist');
      // 用 unpkg CDN 加载 worker，避免 import.meta.url 在浏览器中 404
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

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
      alert('PDF 解析失败，请检查文件格式或重试。');
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

    // 先添加占位消息让用户看到 loading 动画
    setMessages([...newMessages, { role: 'assistant', content: '' }]);

    // 发起请求
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, knowledge }),
      });
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '⚠️ 网络请求失败，请检查网络连接后重试。' }]);
      return;
    }

    if (!response.ok) {
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ 服务器错误 (${response.status})，请稍后重试。` }]);
      return;
    }

    // 读取流
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let aiContent = '';

    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
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
          } catch { /* ignore parse errors for incomplete lines */ }
        }
      }
    } catch {
      // 流读取中断——已有部分内容就保留，否则给错误提示
      if (aiContent) {
        setMessages([...newMessages, { role: 'assistant', content: aiContent + '\n\n⚠️ 响应中断，可能只收到部分内容。' }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: '⚠️ 读取响应失败，请重试。' }]);
      }
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 overflow-hidden">
      {/* 背景动态光晕 */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto w-full h-dvh p-4 flex flex-col gap-4">
        {/* ===== 顶部工具栏（上传按钮） ===== */}
        <div className="shrink-0 backdrop-blur-2xl bg-white/[0.06] border border-white/[0.08] rounded-2xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex items-center gap-3">
          <input type="file" accept=".txt" ref={fileInputRef} onChange={handleTxtUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.18] hover:text-white transition-all duration-300 active:scale-[0.97]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            TXT
          </button>

          <input type="file" accept=".pdf" ref={pdfInputRef} onChange={handlePdfUpload} className="hidden" />
          <button
            onClick={() => pdfInputRef.current?.click()}
            className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.18] hover:text-white transition-all duration-300 active:scale-[0.97]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            PDF
          </button>

          <div className="w-px h-5 bg-white/[0.08]" />

          {knowledge ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              文档已加载
            </span>
          ) : (
            <span className="text-sm text-white/25 italic">上传 TXT / PDF 作为知识库</span>
          )}
        </div>

        {/* ===== 聊天消息区域 ===== */}
        <div className="flex-1 overflow-y-auto backdrop-blur-2xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-white/25 select-none">
              <svg className="w-20 h-20 mb-5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p className="text-lg font-medium text-white/30">开始一段对话</p>
              <p className="text-sm mt-1 text-white/20">在下方输入消息，与 AI 助手交流</p>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`flex mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} last:mb-0`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? '' : ''}`}>
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl rounded-br-md shadow-lg shadow-indigo-500/20'
                      : 'bg-white/[0.07] text-white/90 border border-white/[0.06] rounded-2xl rounded-bl-md backdrop-blur-sm markdown-body'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : msg.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const isInline = !className;
                          if (isInline) {
                            return (
                              <code
                                className="bg-white/[0.12] text-pink-300 px-1.5 py-0.5 rounded-md text-[0.8em] font-mono"
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          }
                          const lang = className?.replace('language-', '') || '';
                          return (
                            <div className="relative group my-3">
                              {lang && (
                                <div className="absolute top-0 right-0 px-3 py-1 text-[10px] uppercase tracking-wider text-white/30 rounded-bl-lg rounded-tr-lg bg-white/[0.04] border-l border-b border-white/[0.06]">
                                  {lang}
                                </div>
                              )}
                              <pre className="overflow-x-auto bg-black/40 border border-white/[0.06] rounded-xl p-4 pt-2 text-[0.9em] leading-relaxed">
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </pre>
                            </div>
                          );
                        },
                        a({ href, children }) {
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-white/20"
                            >
                              {children}
                            </a>
                          );
                        },
                        ul({ children }) {
                          return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>;
                        },
                        ol({ children }) {
                          return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>;
                        },
                        li({ children }) {
                          return <li className="text-white/85 leading-relaxed">{children}</li>;
                        },
                        h1({ children }) {
                          return <h1 className="text-lg font-bold mt-4 mb-2 text-white border-b border-white/[0.06] pb-1">{children}</h1>;
                        },
                        h2({ children }) {
                          return <h2 className="text-base font-bold mt-3 mb-2 text-white/95">{children}</h2>;
                        },
                        h3({ children }) {
                          return <h3 className="text-sm font-semibold mt-3 mb-1 text-white/90">{children}</h3>;
                        },
                        p({ children }) {
                          return <p className="my-1.5 text-white/85 leading-relaxed">{children}</p>;
                        },
                        blockquote({ children }) {
                          return (
                            <blockquote className="border-l-2 border-indigo-500/50 pl-4 my-2 text-white/60 italic">
                              {children}
                            </blockquote>
                          );
                        },
                        hr() {
                          return <hr className="my-4 border-white/[0.06]" />;
                        },
                        strong({ children }) {
                          return <strong className="font-semibold text-white">{children}</strong>;
                        },
                        em({ children }) {
                          return <em className="italic text-white/90">{children}</em>;
                        },
                        table({ children }) {
                          return (
                            <div className="overflow-x-auto my-2">
                              <table className="w-full text-sm">{children}</table>
                            </div>
                          );
                        },
                        img({ src, alt }) {
                          return <img src={src} alt={alt || ''} loading="lazy" />;
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 h-5">
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {/* 用于自动滚动的锚点 */}
          <div ref={messagesEndRef} />
        </div>

        {/* ===== 底部输入区域 ===== */}
        <div className="shrink-0 backdrop-blur-2xl bg-white/[0.06] border border-white/[0.08] rounded-2xl p-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              className="flex-1 bg-white/[0.04] text-white placeholder-white/25 border border-white/[0.08] rounded-xl px-4 py-3 text-sm outline-none transition-all duration-300 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 hover:border-white/[0.15]"
            />
            <button
              type="submit"
              className="group flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:shadow-xl hover:scale-[1.02] active:scale-[0.97]"
            >
              发送
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
