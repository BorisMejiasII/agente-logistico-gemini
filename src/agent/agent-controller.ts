import { GoogleGenAI, createPartFromFunctionResponse, Part } from '@google/genai';
import { agentTools } from '../tools/tool-declarations.js';
import { InventoryToolsExecutor } from '../tools/inventory.tools.js';
import { OrderStateMachine } from '../tools/order-state-machine.js';
import { IInventoryRepository } from '../domain/inventory.repository.js';
import { SYSTEM_INSTRUCTIONS } from './system-instructions.js';
import { InventorySourceMode } from '../config/env.config.js';

export interface AgentResponse {
  text: string;
  toolCallsExecuted: Array<{
    name: string;
    args: Record<string, unknown>;
    success: boolean;
    output: unknown;
  }>;
}

export class AgentController {
  private ai: GoogleGenAI;
  private chatSession: ReturnType<GoogleGenAI['chats']['create']> | null = null;
  public readonly stateMachine: OrderStateMachine;
  public toolsExecutor: InventoryToolsExecutor;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private inventoryRepo: IInventoryRepository,
    public currentMode: InventorySourceMode
  ) {
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    this.stateMachine = new OrderStateMachine();
    this.toolsExecutor = new InventoryToolsExecutor(this.inventoryRepo, this.stateMachine);
    this.initChat();
  }

  public setRepository(repo: IInventoryRepository, mode: InventorySourceMode): void {
    this.inventoryRepo = repo;
    this.currentMode = mode;
    // Invalidar cualquier operación previa y restablecer la máquina de estados
    this.stateMachine.reset();
    // Reiniciar la sesión de chat para evitar contexto conversacional incompatible con la nueva fuente
    this.initChat();
    this.toolsExecutor = new InventoryToolsExecutor(this.inventoryRepo, this.stateMachine);
  }

  public initChat(): void {
    this.chatSession = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        tools: agentTools,
        temperature: 0.2 // Baja temperatura para determinismo y precisión en datos
      }
    });
  }

  public resetSession(): void {
    this.stateMachine.reset();
    this.initChat();
  }

  /**
   * Envía un mensaje de usuario al agente, orquestando el flujo completo de llamadas a herramientas,
   * actualización determinista de estados y respuestas en lenguaje natural.
   */
  public async handleUserMessage(userMessage: string): Promise<AgentResponse> {
    if (!this.chatSession) {
      this.initChat();
    }

    const executedTools: AgentResponse['toolCallsExecuted'] = [];

    // 1. Extraer requerimiento explícito del mensaje de usuario si existe (ej. "10 laptops ThinkPad")
    const extracted = this.stateMachine.extractRequirementFromText(userMessage);

    // 2. Procesar el mensaje a través de la máquina de estados determinista
    this.stateMachine.processUserMessage(userMessage);

    // 3. Enviar mensaje a Gemini
    let currentResponse = await this.chatSession!.sendMessage({
      message: userMessage
    });

    // 4. Manejar ciclo de Function Calling si Gemini invoca herramientas
    let loopGuard = 0;
    const MAX_LOOPS = 5;

    while (currentResponse.functionCalls && currentResponse.functionCalls.length > 0 && loopGuard < MAX_LOOPS) {
      loopGuard++;
      const functionResponseParts: Part[] = [];

      for (const call of currentResponse.functionCalls) {
        const toolName = call.name ?? '';
        const toolArgs = (call.args as Record<string, unknown>) ?? {};

        // Si es una consulta de stock y se detectó una cantidad requerida en el turno
        if (toolName === 'consultar_stock' && extracted?.quantity && typeof toolArgs.producto === 'string') {
          const canonicalKey = this.inventoryRepo.getCanonicalProductKey(toolArgs.producto) ?? undefined;
          this.stateMachine.registerOrUpdateRequirement(toolArgs.producto, extracted.quantity, canonicalKey);
        }

        // Ejecución segura y validada de la herramienta
        const execResult = await this.toolsExecutor.executeToolCall(toolName, toolArgs);

        executedTools.push({
          name: toolName,
          args: toolArgs,
          success: execResult.success,
          output: execResult.payload
        });

        // Crear parte nativa FunctionResponse oficial de @google/genai sin inventar IDs artificiales
        const responsePart: Part = {
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: toolName,
            response: execResult.payload
          }
        };

        functionResponseParts.push(responsePart);
      }

      // Enviar las respuestas de las funciones de vuelta al modelo preservando el historial
      currentResponse = await this.chatSession!.sendMessage({
        message: functionResponseParts
      });
    }

    // Verificar si se alcanzó el límite máximo mientras aún quedaban llamadas pendientes
    if (loopGuard >= MAX_LOOPS && currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
      return {
        text: `[ERROR] Se alcanzó el límite máximo de iteraciones de herramientas (${MAX_LOOPS}) sin completar la operación. El proceso se detuvo por seguridad para preservar un estado consistente.`,
        toolCallsExecuted: executedTools
      };
    }

    const textOutput = currentResponse.text || (executedTools.length > 0 ? 'Herramientas ejecutadas correctamente.' : 'Sin respuesta del modelo.');

    return {
      text: textOutput,
      toolCallsExecuted: executedTools
    };
  }
}
