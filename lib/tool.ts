import { z } from 'zod';
import { tool } from 'ai';

// 1.天气查询工具（后续复制你之前城市查询逻辑）
const getWeather = tool({
  description: '查询指定城市实时天气，必须传入城市名称',
  parameters: z.object({
    city: z.string().describe('需要查询的城市名，如北京、上海'),
  }),
  execute: async ({ city }) => {
    // 原有天气接口逻辑粘贴此处
    return { city, temp: '26℃', weather: '晴' };
  },
});

// 2.计算器工具
const calcTool = tool({
  description: '数学四则运算、开方计算',
  parameters: z.object({ expr: z.string().describe('数学表达式') }),
  execute: async ({ expr }) => ({ result: eval(expr) }),
});

// 统一导出给后端接口挂载
export const tools = { getWeather, calcTool };