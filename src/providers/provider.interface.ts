import { IInventoryRepository } from '../domain/inventory.repository.js';
import { OrderStateMachine } from '../tools/order-state-machine.js';
import { InventoryToolsExecutor } from '../tools/inventory.tools.js';

export type LLMProviderId = 'gemini' | 'openai';

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ProviderToolExecution[];
}

export interface ProviderToolExecution {
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  output: unknown;
}

export interface ProviderTurnContext {
  inventoryRepo: IInventoryRepository;
  stateMachine: OrderStateMachine;
  toolsExecutor: InventoryToolsExecutor;
  history: StoredChatMessage[];
  rawHistory?: unknown;
}

export interface ProviderTurnResult {
  text: string;
  toolCallsExecuted: ProviderToolExecution[];
  rawHistory?: unknown;
}

export interface VerifyKeyResult {
  valid: boolean;
  message?: string;
  model?: string;
}

export interface ILLMProvider {
  readonly providerId: LLMProviderId;
  readonly defaultModel: string;
  verifyApiKey(apiKey: string, modelOverride?: string): Promise<VerifyKeyResult>;
  sendMessage(
    userMessage: string,
    apiKey: string,
    context: ProviderTurnContext,
    modelOverride?: string
  ): Promise<ProviderTurnResult>;
}
