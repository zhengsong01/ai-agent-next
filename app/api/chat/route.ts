// Next.js 配置
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 1.天气工具
function getWeather(city: string) {
  const cityMap: Record<string, string> = {滑县: "安阳"};
  const weatherData: Record<string, string> = {
    北京: "晴，26℃，微风",上海: "多云，24℃",广州: "小雨，28℃",
    郑州: "晴，25℃",河南: "郑州晴25℃",洛阳: "多云23℃",安阳: "多云24℃"
  };
  if (weatherData[city]) return weatherData[city];
  if (cityMap[city]) return `${city}（属${cityMap[city]}）：${weatherData[cityMap[city]]}`;
  return `暂无${city}的天气数据`;
}

// 2.计算器
function calculator(expression: string) {
  try { return eval(expression).toString(); }
  catch { return "计算失败"; }
}

// 文档分片——按段落语义切割，保持语义完整性
function splitText(text: string, maxChunk = 500): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    const next = current ? current + "\n\n" + p : p;
    if (next.length > maxChunk && current) {
      chunks.push(current);
      current = p;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  // 如果某个段落仍超长，按句子切分
  return chunks.flatMap(c => {
    if (c.length <= maxChunk) return [c];
    const sentences = c.match(/[^。！？\n]+[。！？]|\n+/g) || [c];
    const parts: string[] = [];
    let buf = "";
    for (const s of sentences) {
      const next = buf ? buf + s : s;
      if (next.length > maxChunk && buf) {
        parts.push(buf);
        buf = s;
      } else {
        buf = next;
      }
    }
    if (buf) parts.push(buf);
    return parts.length ? parts : [c];
  });
}

// 本地关键词检索——不依赖外部 embedding API，零延迟零成本
// 综合 n-gram 特征匹配 + 字符重叠率 + 完整查询命中
function keywordSearch(chunks: string[], query: string): string {
  // 清洗查询：去标点空格
  const cleanQuery = query.replace(/[\s,，。！？、；：""''（）()\n\r\t·…—·【】《》<>「」『』〔〕]+/g, '');

  // 对极短查询直接返回开头内容（"总结""概述"这类不需要搜索）
  if (cleanQuery.length <= 2) {
    const topK = Math.min(3, chunks.length);
    return chunks.slice(0, topK).join("\n\n---\n\n");
  }

  // 提取 n-gram 特征（双字、三字）
  const features = new Set<string>();
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= cleanQuery.length - len; i++) {
      features.add(cleanQuery.slice(i, i + len));
    }
  }

  // 查询的去重字符集
  const queryChars = new Set(cleanQuery);

  const scored = chunks.map((chunk) => {
    // --- 1) n-gram 特征命中率 ---
    let featureHits = 0;
    for (const f of features) {
      if (chunk.includes(f)) featureHits++;
    }
    const featureScore = features.size > 0 ? featureHits / features.size : 0;

    // --- 2) 字符级别共现率（处理同义/近义场景） ---
    const chunkChars = new Set(chunk.replace(/[\s,，。！？、；：""''（）()\n\r\t·…—·【】《》<>「」『』〔〕]+/g, ''));
    let overlap = 0;
    for (const c of queryChars) {
      if (chunkChars.has(c)) overlap++;
    }
    const charScore = queryChars.size > 0 ? overlap / queryChars.size : 0;

    // --- 3) 完整查询命中加分 ---
    const exactBonus = chunk.includes(cleanQuery) ? 1.0 : 0;
    // 长关键词（>=4字）命中也加分
    let longMatchBonus = 0;
    for (let len = Math.min(4, cleanQuery.length); len <= Math.min(cleanQuery.length, 10); len++) {
      for (let i = 0; i <= cleanQuery.length - len; i++) {
        const sub = cleanQuery.slice(i, i + len);
        if (chunk.includes(sub)) longMatchBonus += 0.3;
      }
    }

    // 综合得分：特征匹配50% + 字符共现25% + 精确命中25%
    const score = featureScore * 0.5 + charScore * 0.25 + Math.min(exactBonus + longMatchBonus, 1) * 0.25;
    return { text: chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 取前5段；如果最高分太低（<0.1）说明没匹配上，直接返回文档开头内容
  const topK = Math.min(5, scored.length);
  const bestScore = scored[0]?.score ?? 0;
  let top: string[];
  if (bestScore < 0.1) {
    // 没匹配到：返回文档开头，让模型自己判断
    top = chunks.slice(0, Math.min(3, chunks.length));
  } else {
    // 只保留得分 > 最高分20% 且 >0 的结果，确保质量
    const threshold = Math.max(bestScore * 0.2, 0.01);
    top = scored.filter(s => s.score >= threshold).slice(0, topK).map(s => s.text);
    if (top.length === 0) top = chunks.slice(0, Math.min(3, chunks.length));
  }

  return top.join("\n\n---\n\n");
}

// 安全转发上游流（避免直接返回上游body可能出现的连接问题）
async function forwardStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Upstream response has no body");

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });
}

function sseResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// 主接口
export async function POST(req: Request) {
  try {
    const { messages, knowledge = "" } = await req.json();
    const lastMsg = messages[messages.length - 1]?.content || "";

    // ===== 1. 知识库 RAG 优先（防止被天气/计算器分支劫持） =====
    if (knowledge.trim()) {
      const chunks = splitText(knowledge);
      const context = keywordSearch(chunks, lastMsg);
      const systemPrompt = `你是知识库问答助手。请基于以下参考文档回答用户问题。

规则：
- 优先使用参考文档中的内容回答，可以引用原文
- 如果文档中有相关内容，请详细、准确地回答
- 如果文档中确实没有相关内容，先根据自己的知识回答，但需要在最后提醒"（注：此信息文档中未直接提及）"
- 不要编造文档中不存在的数据或细节

参考文档：
${context}`;
      const ragMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
      const res = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "DeepSeek-V4-Flash", messages: ragMessages, stream: true }),
      });
      if (!res.ok) throw new Error(`LLM API ${res.status}`);
      const stream = await forwardStream(res);
      return sseResponse(stream);
    }

    // ===== 2. 天气分支 =====
    if (/天气|温度|气温/.test(lastMsg)) {
      const city = lastMsg.replace(/天气|温度|气温|查|请问|多少|度/g, "").replace(/[^一-龥]/g, "").trim() || "北京";
      const reply = getWeather(city);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`);
          controller.enqueue("data: [DONE]\n\n");
          controller.close();
        },
      });
      return sseResponse(stream);
    }

    // ===== 3. 计算器分支 =====
    if (/[0-9+\-*/.]/.test(lastMsg)) {
      const reply = calculator(lastMsg);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`);
          controller.enqueue("data: [DONE]\n\n");
          controller.close();
        },
      });
      return sseResponse(stream);
    }

    // ===== 4. 普通闲聊 =====
    const res = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "DeepSeek-V4-Flash", messages, stream: true }),
    });
    if (!res.ok) throw new Error(`LLM API ${res.status}`);
    const stream = await forwardStream(res);
    return sseResponse(stream);
  } catch (err) {
    console.error("API Error:", err);
    const errorMsg = err instanceof Error ? err.message : "未知错误";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          `data: ${JSON.stringify({ choices: [{ delta: { content: `⚠️ 服务器处理出错：${errorMsg}，请重试。` } }] })}\n\n`
        );
        controller.enqueue("data: [DONE]\n\n");
        controller.close();
      },
    });
    return sseResponse(stream);
  }
}
