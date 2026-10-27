import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { config, requireApiKey, InventorySourceMode } from './config/env.config.js';
import { MockInventoryRepository } from './domain/mock-inventory.repo.js';
import { DocumentInventoryRepository } from './domain/document-inventory.repo.js';
import { AgentController } from './agent/agent-controller.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

function printBanner(mode: string, model: string): void {
  console.log(`
${ANSI.cyan}${ANSI.bold}╔══════════════════════════════════════════════════════════════════╗
║               AGENTE CONVERSACIONAL DE LOGÍSTICA                 ║
║       Control de Inventarios & Órdenes de Compra con Gemini      ║
╚══════════════════════════════════════════════════════════════════╝${ANSI.reset}
  ${ANSI.bold}Modelo:${ANSI.reset}     ${ANSI.green}${model}${ANSI.reset}
  ${ANSI.bold}Modo Base:${ANSI.reset}  ${ANSI.yellow}${mode.toUpperCase()}${ANSI.reset} ${mode === 'mock' ? '(Stock aleatorio consistente 1-5 para prueba PDF)' : '(Inventario auditado con trazabilidad documental)'}
  ${ANSI.bold}Comandos:${ANSI.reset}   ${ANSI.dim}mode <mock|unstructured> | status | reset | salir${ANSI.reset}
────────────────────────────────────────────────────────────────────
`);
}

async function main(): Promise<void> {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (error: unknown) {
    console.error(`\n${ANSI.red}${ANSI.bold}[ERROR DE CONFIGURACIÓN]${ANSI.reset} ${(error as Error).message}\n`);
    console.log(`Para configurar tu clave:`);
    console.log(`  1. Copia .env.example a .env:  ${ANSI.yellow}cp .env.example .env${ANSI.reset}`);
    console.log(`  2. Edita GEMINI_API_KEY con tu clave de Google AI Studio.\n`);
    process.exit(1);
  }

  const mockRepo = new MockInventoryRepository();
  const docRepo = new DocumentInventoryRepository();

  let activeMode: InventorySourceMode = config.inventorySource;
  const activeRepo = activeMode === 'mock' ? mockRepo : docRepo;

  const agent = new AgentController(apiKey, config.geminiModel, activeRepo, activeMode);

  printBanner(activeMode, config.geminiModel);

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const userInput = await rl.question(`${ANSI.cyan}${ANSI.bold}Usuario > ${ANSI.reset}`);
      const trimmed = userInput.trim();

      if (!trimmed) {
        continue;
      }

      // Comandos especiales de control CLI
      const lower = trimmed.toLowerCase();
      if (lower === 'exit' || lower === 'salir') {
        console.log(`\n${ANSI.green}Cerrando sesión del Agente Logístico. ¡Hasta pronto!${ANSI.reset}\n`);
        break;
      }

      if (lower === 'reset') {
        agent.resetSession();
        console.log(`\n${ANSI.yellow}✔ Sesión reiniciada. Historial y máquina de estados restablecidos.${ANSI.reset}\n`);
        continue;
      }

      if (lower === 'status') {
        const order = agent.stateMachine.getPendingOrder();
        console.log(`\n${ANSI.blue}${ANSI.bold}[ESTADO DEL SISTEMA]${ANSI.reset}`);
        console.log(`  Modo Inventario:    ${ANSI.yellow}${agent.currentMode}${ANSI.reset}`);
        if (!order) {
          console.log(`  Operación pendiente: ${ANSI.dim}Ninguna${ANSI.reset}\n`);
        } else {
          console.log(`  Producto:           ${order.normalizedProduct}`);
          console.log(`  Requeridos:         ${order.requiredQuantity}`);
          console.log(`  Disponibles:        ${order.availableStock}`);
          console.log(`  Faltante calculado: ${order.missingQuantity}`);
          console.log(`  Estado de orden:    ${ANSI.magenta}${order.state}${ANSI.reset}\n`);
        }
        continue;
      }

      if (lower.startsWith('mode ')) {
        const targetMode = lower.replace('mode ', '').trim();
        if (targetMode === 'mock' || targetMode === 'unstructured') {
          activeMode = targetMode;
          agent.setRepository(activeMode === 'mock' ? mockRepo : docRepo, activeMode);
          console.log(`\n${ANSI.green}✔ Modo de inventario cambiado a: ${ANSI.bold}${activeMode.toUpperCase()}${ANSI.reset}\n`);
        } else {
          console.log(`\n${ANSI.red}Modo no reconocido. Opciones válidas: 'mode mock' o 'mode unstructured'.${ANSI.reset}\n`);
        }
        continue;
      }

      if (lower === 'help' || lower === 'ayuda') {
        console.log(`\n${ANSI.bold}Comandos disponibles:${ANSI.reset}`);
        console.log(`  ${ANSI.cyan}mode mock${ANSI.reset}          - Cambia a fuente de inventario Mock (PDF 1-5)`);
        console.log(`  ${ANSI.cyan}mode unstructured${ANSI.reset}  - Cambia a fuente de inventario desestructurado auditado`);
        console.log(`  ${ANSI.cyan}status${ANSI.reset}             - Muestra el estado actual de la máquina de compras`);
        console.log(`  ${ANSI.cyan}reset${ANSI.reset}              - Reinicia la sesión de chat y la máquina de estados`);
        console.log(`  ${ANSI.cyan}salir / exit${ANSI.reset}       - Cierra el programa\n`);
        continue;
      }

      // Procesar interacción con el agente Gemini
      process.stdout.write(`${ANSI.dim}Gemini pensando...${ANSI.reset}\r`);
      try {
        const response = await agent.handleUserMessage(trimmed);
        // Limpiar indicador de pensamiento
        process.stdout.write('                     \r');

        console.log(`\n${ANSI.green}${ANSI.bold}Agente:${ANSI.reset}\n${response.text}\n`);
      } catch (err: unknown) {
        process.stdout.write('                     \r');
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`\n${ANSI.red}${ANSI.bold}[ERROR AGENTE]${ANSI.reset} ${errorMsg}`);
        console.log(`${ANSI.dim}Puedes reintentar tu consulta, cambiar de modo o escribir 'salir' para finalizar.${ANSI.reset}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('Error fatal al iniciar la aplicación:', err);
  process.exit(1);
});
