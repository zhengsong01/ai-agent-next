import { z } from 'zod';

// 适配你项目版本的工具格式（无类型错误）
export const tools = {
  // 1. 天气查询
  getWeather: {
    description: '查询指定城市实时天气，必须传入城市名称',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '需要查询的城市名，如北京、上海',
        },
      },
      required: ['city'],
    },
    execute: async ({ city }: { city: string }) => {
      return { city, temp: '26℃', weather: '晴' };
    },
  },

  // 2. 计算器
  calcTool: {
    description: '数学四则运算、开方计算',
    parameters: {
      type: 'object',
      properties: {
        expr: {
          type: 'string',
          description: '数学表达式，例如 1+2*3',
        },
      },
      required: ['expr'],
    },
    execute: async ({ expr }: { expr: string }) => {
      return { result: eval(expr) };
    },
  },
};