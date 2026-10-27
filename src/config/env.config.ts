import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env si existe
dotenv.config();

export type InventorySourceMode = 'mock' | 'unstructured';

export interface AppConfig {
  geminiApiKey: string | undefined;
  geminiModel: string;
  inventorySource: InventorySourceMode;
  unstructuredFilePath: string;
}

const rawSource = (process.env.INVENTORY_SOURCE ?? 'mock').trim().toLowerCase();
const inventorySource: InventorySourceMode = rawSource === 'unstructured' ? 'unstructured' : 'mock';

export const config: AppConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: (process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'),
  inventorySource,
  unstructuredFilePath: path.resolve(process.cwd(), 'data', 'notas_de_inventario_desestructuradas.txt')
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
