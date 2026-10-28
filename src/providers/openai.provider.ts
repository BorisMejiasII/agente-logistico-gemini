import OpenAI from 'openai';
import {
  ILLMProvider,
  LLMProviderId,
  ProviderTurnContext,
  ProviderTurnResult,
  ProviderToolExecution,
  VerifyKeyResult
} from './provider.interface.js';
import { SYSTEM_INSTRUCTIONS } from '../agent/system-instructions.js';
import { withRetry, RetryOptions } from '../utils/retry.js';
import { MaxToolLoopsExceededError } from '../agent/agent-controller.js';

export const openAITools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_stock',
      description:
        'Consulta el stock disponible para asignación inmediata de un producto en bodega.',
      parameters: {
        type: 'object',
        properties: {
          producto: {
            type: 'string',
            description:
              'Nombre o descripción del producto a consultar en el inventario (ej. "Laptops ThinkPad", "Monitores Dell 27", "Mouses Logitech").'
          }
        },
        required: ['producto'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emitir_orden_compra',
      description:
        'Emite una orden de compra oficial en el sistema para reponer unidades faltantes. Requiere autorización y confirmación inequívoca previa del usuario.',
      parameters: {
        type: 'object',
        properties: {
          producto: {
            type: 'string',
            description: 'Nombre del producto a reponer mediante la orden de compra.'
          },
          cantidad: {
            type: 'integer',
            description:
              'Cantidad exacta de unidades faltantes a comprar (entero positivo igual al faltante calculado).'
          }
        },
        required: ['producto', 'cantidad'],
        additionalProperties: false
      }
    }
  }
];

export class OpenAIProvider implements ILLMProvider {
  public readonly providerId: LLMProviderId = 'openai';
  public readonly defaultModel: string;

  constructor(
    defaultModel: string = 'gpt-4o-mini',
    private readonly retryOptions: RetryOptions = {}
  ) {
    this.defaultModel = defaultModel;
  }

  public async verifyApiKey(apiKey: string, modelOverride?: string): Promise<VerifyKeyResult> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return { valid: false, message: 'La API Key de OpenAI está vacía.' };
    }
    try {
      const client = new OpenAI({ apiKey: trimmed });
      // Verificación de conectividad llamando a list models sin consumo de tokens
      await client.models.list();
      return {
        valid: true,
        message: 'Conexión verificada exitosamente con OpenAI.',
        model: modelOverride || this.defaultModel
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        message: `Error al validar API Key de OpenAI: ${msg}`
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
    const client = new OpenAI({ apiKey });

    // 1. Extraer requerimiento explícito del mensaje
    const extracted = context.stateMachine.extractRequirementFromText(userMessage);

    // 2. Procesar el mensaje a través de la máquina de estados determinista
    context.stateMachine.processUserMessage(userMessage);

    // 3. Reconstruir historial de mensajes para OpenAI
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (Array.isArray(context.rawHistory) && context.rawHistory.length > 0) {
      messages.push(...(context.rawHistory as OpenAI.ChatCompletionMessageParam[]));
      messages.push({ role: 'user', content: userMessage });
    } else {
      messages.push({ role: 'system', content: SYSTEM_INSTRUCTIONS });
      if (context.history && context.history.length > 0) {
        for (const msg of context.history) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: userMessage });
    }

    const executedTools: ProviderToolExecution[] = [];

    // 4. Iniciar comunicación con OpenAI usando reintentos de red
    let currentResponse = await withRetry(
      () =>
        client.chat.completions.create({
          model,
          messages,
          tools: openAITools,
          temperature: 0.2
        }),
      this.retryOptions
    );

    let choice = currentResponse.choices[0];
    let assistantMessage = choice?.message;
    let loopGuard = 0;
    const MAX_LOOPS = 5;

    // 5. Manejar Function Calling oficial de OpenAI
    while (
      assistantMessage?.tool_calls &&
      assistantMessage.tool_calls.length > 0 &&
      loopGuard < MAX_LOOPS
    ) {
      loopGuard++;
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }

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

        // Ejecución validada determinista
        const execResult = await context.toolsExecutor.executeToolCall(toolName, toolArgs);

        executedTools.push({
          name: toolName,
          args: toolArgs,
          success: execResult.success,
          output: execResult.payload
        });

        // Registrar respuesta oficial de herramienta para OpenAI
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(execResult.payload)
        });
      }

      // Siguiente iteración al modelo con los resultados de las herramientas
      currentResponse = await withRetry(
        () =>
          client.chat.completions.create({
            model,
            messages,
            tools: openAITools,
            temperature: 0.2
          }),
        this.retryOptions
      );

      choice = currentResponse.choices[0];
      assistantMessage = choice?.message;
    }

    if (
      loopGuard >= MAX_LOOPS &&
      assistantMessage?.tool_calls &&
      assistantMessage.tool_calls.length > 0
    ) {
      throw new MaxToolLoopsExceededError(MAX_LOOPS);
    }

    // Agregar respuesta final del asistente a los mensajes acumulados
    if (assistantMessage) {
      messages.push(assistantMessage);
    }

    const textOutput =
      assistantMessage?.content ||
      (executedTools.length > 0
        ? 'Herramientas ejecutadas correctamente.'
        : 'Sin respuesta del modelo.');

    return {
      text: textOutput,
      toolCallsExecuted: executedTools,
      rawHistory: messages
    };
  }
}
