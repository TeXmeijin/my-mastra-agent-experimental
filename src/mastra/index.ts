import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { weatherWorkflow } from './workflows';
import { weatherAgent } from './agents';
import { contentModerationWorkflow } from './workflows/content-moderation';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, contentModerationWorkflow },
  agents: { weatherAgent },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
