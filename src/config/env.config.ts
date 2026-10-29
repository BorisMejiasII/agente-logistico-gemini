import dotenv from 'dotenv';

// Cargar variables de entorno desde .env si existe
dotenv.config();

// Compatibilidad con alias si la variable fue nombrada OPENIA_API_KEY
if (!process.env.OPENAI_API_KEY && process.env.OPENIA_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.OPENIA_API_KEY;
}

export type InventorySourceMode = 'mock' | 'unstructured';

export interface AppConfig {
  geminiApiKey: string | undefined;
  geminiModel: string;
  openAiApiKey: string | undefined;
  openAiModel: string;
  inventorySource: InventorySourceMode;
}

const rawSource = (process.env.INVENTORY_SOURCE ?? 'mock').trim().toLowerCase();
const inventorySource: InventorySourceMode = rawSource === 'unstructured' ? 'unstructured' : 'mock';

export const config: AppConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: (process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'),
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  openAiModel: (process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'),
  inventorySource
};

export function requireApiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error(
      'Falta la variable de entorno GEMINI_API_KEY. ' +
      'Por favor configura GEMINI_API_KEY en tu archivo .env o en las variables de entorno del sistema.'
    );
  }
  return config.geminiApiKey;
}
