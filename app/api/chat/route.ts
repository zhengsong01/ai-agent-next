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

// 余弦相似度：计算两个向量贴近程度（值越接近1语义越像）
function cosSimilarity(vecA: number[], vecB: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for(let i=0;i<vecA.length;i++){
    dot += vecA[i]*vecB[i];
    normA += vecA[i]**2;
    normB += vecB[i]**2;
  }
  return dot / (Math.sqrt(normA)*Math.sqrt(normB));
}

// 调用通义Embedding接口生成文本向量
async function getEmbedding(text: string) {
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/embeddings`,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"text-embedding-v1",
      input:text
    })
  })
  const json = await res.json();
  return json.data[0].embedding as number[];
}

// 文档分片
function splitText(text: string, chunkSize = 180) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// 【语义向量检索】替换原来关键词检索
async function vectorSearch(chunks: string[], query: string) {
  // 1.提问生成向量
  const queryVec = await getEmbedding(query);
  // 2.所有文档片段逐个生成向量、算相似度
  const chunkScore: {text:string;score:number}[] = [];
  for(const ck of chunks){
    const vec = await getEmbedding(ck);
    const score = cosSimilarity(queryVec, vec);
    chunkScore.push({text:ck,score});
  }
  // 相似度从高到低排序，取前3段
  chunkScore.sort((a,b)=>b.score - a.score);
  const top3 = chunkScore.slice(0,3).map(item=>item.text);
  return top3.join("\n====\n") || "无匹配文档内容";
}

// 主接口
export async function POST(req: Request) {
  const { messages, knowledge = "" } = await req.json();
  const lastMsg = messages[messages.length - 1]?.content || "";
  let reply = "";

  // 天气分支
  if (/天气|温度|气温/.test(lastMsg)) {
    let city = lastMsg.replace(/天气|温度|气温|查|请问|多少|度/g, "").replace(/[^\u4e00-\u9fa5]/g, "").trim() || "北京";
    reply = getWeather(city);
  }
  // 计算器分支
  else if (/[0-9+\-*/.]/.test(lastMsg)) {
    reply = calculator(lastMsg);
  }
  // 向量RAG分支
  else if (knowledge.trim()) {
    const chunks = splitText(knowledge);
    const context = await vectorSearch(chunks, lastMsg);
    // 强制约束大模型只能依赖文档
    const systemPrompt = `【硬性规则】仅允许使用下面参考文档回答，文档没有就回复：文档未收录该信息，禁止凭空编造内容。
参考文档：
${context}`;
    const ragMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];
    const res = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "qwen-turbo", messages: ragMessages, stream: true }),
    });
    return new Response(res.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }
  // 普通闲聊
  else {
    const res = await fetch(process.env.OPENAI_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "qwen-turbo", messages, stream: true }),
    });
    return new Response(res.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // 工具返回流式
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\n`);
      controller.enqueue("data: [DONE]\n\n");
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}