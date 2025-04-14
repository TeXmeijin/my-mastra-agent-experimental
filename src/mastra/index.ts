import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { weatherWorkflow } from './workflows';
import { zennQuizWorkflow } from './workflows/zenn-quiz-workflow';
import { weatherAgent } from './agents';
import { quizGeneratorAgent, quizIntegratorAgent } from './agents/quiz-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, zennQuizWorkflow },
  agents: {
    weatherAgent,
    quizGeneratorAgent,
    quizIntegratorAgent
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
