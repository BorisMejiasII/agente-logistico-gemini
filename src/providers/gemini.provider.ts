import { GoogleGenAI, Part, Content } from '@google/genai';
import {
  ILLMProvider,
  LLMProviderId,
  ProviderTurnContext,
  ProviderTurnResult,
  ProviderToolExecution,
  VerifyKeyResult
} from './provider.interface.js';
import { agentTools } from '../tools/tool-declarations.js';
import { SYSTEM_INSTRUCTIONS } from '../agent/system-instructions.js';
import { withRetry, RetryOptions } from '../utils/retry.js';
import { MaxToolLoopsExceededError } from '../agent/agent-controller.js';

export class GeminiProvider implements ILLMProvider {
  public readonly providerId: LLMProviderId = 'gemini';
  public readonly defaultModel: string;

  constructor(
    defaultModel: string = 'gemini-3.5-flash-lite',
    private readonly retryOptions: RetryOptions = {}
  ) {
    this.defaultModel = defaultModel;
  }

  public async verifyApiKey(apiKey: string, modelOverride?: string): Promise<VerifyKeyResult> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return { valid: false, message: 'La API Key de Gemini está vacía.' };
    }
    try {
      const ai = new GoogleGenAI({ apiKey: trimmed });
      // Verificación de conectividad y credencial sin consumir créditos costosos
      await ai.models.list();
      return {
        valid: true,
        message: 'Conexión verificada exitosamente con Gemini.',
        model: modelOverride || this.defaultModel
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        message: `Error al validar API Key de Gemini: ${msg}`
      };
    }
  }

  public async sendMessage(
    userMessage: string,
    apiKey: string,
    context: ProviderTurnContext,
    modelOverride?: string
  ): Promise<ProviderTurnResult> {
    const model = modelOverride || this.defaultModel;
    const ai = new GoogleGenAI({ apiKey });

    // 1. Extraer requerimiento explícito del mensaje
    const extracted = context.stateMachine.extractRequirementFromText(userMessage);

    // 2. Procesar el mensaje a través de la máquina de estados determinista
    context.stateMachine.processUserMessage(userMessage);

    // 3. Preparar o reconstruir el historial para Gemini
    let initialHistory: Content[] = [];
    if (Array.isArray(context.rawHistory) && context.rawHistory.length > 0) {
      initialHistory = context.rawHistory as Content[];
    } else if (context.history && context.history.length > 0) {
      // Reconstruir desde StoredChatMessage si rawHistory no existe
      initialHistory = context.history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
    }

    const chatSession = ai.chats.create({
      model,
      history: initialHistory,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        tools: agentTools,
        temperature: 0.2
      }
    });

    const executedTools: ProviderToolExecution[] = [];

    // 4. Enviar mensaje de usuario con reintentos
    let currentResponse = await withRetry(
      () => chatSession.sendMessage({ message: userMessage }),
      this.retryOptions
    );

    // 5. Manejar ciclo de Function Calling
    let loopGuard = 0;
    const MAX_LOOPS = 5;

    while (
      currentResponse.functionCalls &&
      currentResponse.functionCalls.length > 0 &&
      loopGuard < MAX_LOOPS
    ) {
      loopGuard++;
      const functionResponseParts: Part[] = [];

      for (const call of currentResponse.functionCalls) {
        const toolName = call.name ?? '';
        const toolArgs = (call.args as Record<string, unknown>) ?? {};

        // Si es consulta de stock y se detectó cantidad requerida
        if (
          toolName === 'consultar_stock' &&
          extracted?.quantity &&
          typeof toolArgs.producto === 'string'
        ) {
          const canonicalKey =
            context.inventoryRepo.getCanonicalProductKey(toolArgs.producto) ?? undefined;
          context.stateMachine.registerOrUpdateRequirement(
            toolArgs.producto,
            extracted.quantity,
            canonicalKey
          );
        }

        // Ejecución determinista de la herramienta
        const execResult = await context.toolsExecutor.executeToolCall(toolName, toolArgs);

        executedTools.push({
          name: toolName,
          args: toolArgs,
          success: execResult.success,
          output: execResult.payload
        });

        const responsePart: Part = {
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: toolName,
            response: execResult.payload
          }
        };

        functionResponseParts.push(responsePart);
      }

      currentResponse = await withRetry(
        () => chatSession.sendMessage({ message: functionResponseParts }),
        this.retryOptions
      );
    }

    if (
      loopGuard >= MAX_LOOPS &&
      currentResponse.functionCalls &&
      currentResponse.functionCalls.length > 0
    ) {
      throw new MaxToolLoopsExceededError(MAX_LOOPS);
    }

    const textOutput =
      currentResponse.text ||
      (executedTools.length > 0
        ? 'Herramientas ejecutadas correctamente.'
        : 'Sin respuesta del modelo.');

    // Capturar historial actualizado para sesiones serverless
    let updatedHistory: Content[] = [];
    try {
      updatedHistory = chatSession.getHistory();
    } catch {
      // Fallback si no está disponible
    }

    return {
      text: textOutput,
      toolCallsExecuted: executedTools,
      rawHistory: updatedHistory
    };
  }
}
