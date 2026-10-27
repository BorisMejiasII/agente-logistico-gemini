# Agente Conversacional de Logística e Inventario 📦🤖

Agente inteligente desarrollado en **Node.js** y **TypeScript estricto** utilizando el SDK oficial [`@google/genai`](https://www.npmjs.com/package/@google/genai). El sistema combina **Function Calling nativo** con una **máquina de estados determinista** en código para garantizar que ninguna orden de compra se ejecute sin una confirmación inequívoca del usuario, stock validado y cálculo exacto de faltantes.

---

## 🏗️ Arquitectura y Principios de Diseño

```text
├── data/
│   └── notas_de_inventario_desestructuradas.txt   # Copia fiel del archivo de logs, correos y notas OCR
├── src/
│   ├── config/
│   │   └── env.config.ts                         # Carga de variables con dotenv (API Key, Model, Source)
│   ├── domain/
│   │   ├── inventory.types.ts                    # Tipado estricto (PendingOrder, InventoryRecord, Metadatos)
│   │   ├── inventory.repository.ts               # Contrato IInventoryRepository y errores de dominio
│   │   ├── mock-inventory.repo.ts                # Stock aleatorio consistente (1-5) para escenario PDF
│   │   └── document-inventory.repo.ts            # Inventario consolidado con auditoría de 26+ categorías
│   ├── tools/
│   │   ├── tool-declarations.ts                  # Declaraciones FunctionDeclaration nativas (@google/genai)
│   │   ├── order-state-machine.ts                # Máquina de estados determinista y análisis léxico
│   │   └── inventory.tools.ts                    # Ejecutor y validador de consultar_stock y emitir_orden_compra
│   ├── agent/
│   │   ├── system-instructions.ts                # System prompt con reglas anti-alucinación y multi-turno
│   │   └── agent-controller.ts                   # Orquestador del ciclo de chat y FunctionResponse
│   └── index.ts                                  # Interfaz CLI interactiva con soporte de comandos
└── tests/
    ├── inventory-and-state.test.ts               # 33 pruebas unitarias exhaustivas offline
    └── gemini-integration.test.ts                # Prueba de integración multi-turno en vivo con Gemini
```

### 1. Function Calling Nativo y Validación Estricta
- **Cero Regex sobre texto**: No se solicita JSON al modelo en texto plano. Se declaran funciones nativas mediante `FunctionDeclaration` registradas en `tools` de `@google/genai`.
- **Validación en runtime**:
  1. Verifica que la herramienta pertenezca exclusivamente a `consultar_stock` o `emitir_orden_compra`.
  2. Valida tipos de datos y rechaza argumentos adicionales o alucinados (ej. parámetros no definidos).
  3. Lanza y captura errores tipados (`ProductNotFoundError`, `OrderValidationError`), devolviendo un payload enriquecido en el `FunctionResponse` sin interrumpir la sesión de usuario.
  4. Preserva el historial íntegro de la conversación alternando roles `user` y `model`.

### 2. Firmas Exactas del PDF y Metadatos Enriquecidos
- `consultar_stock(producto: string): number`: Devuelve un entero correspondiente al stock disponible para asignación. Para superar la limitación de retornar un único número frente a datos complejos o incertidumbre, el payload del `FunctionResponse` inyecta metadatos detallados (`physicalStock`, `reservedStock`, `defectiveStock`, `dispatchedStock`, `pendingReceiptStock`, `isEstimated`, `requiresSpecialAuth`, `uncertaintyNotes`), permitiendo al agente explicar la situación con total transparencia al usuario.
- `emitir_orden_compra(producto: string, cantidad: number): string`: Emite un log en consola del sistema y retorna el string de status al agente (`STATUS_OK: Orden de compra emitida satisfactoriamente...`).

### 3. Máquina de Estados Determinista (`order-state-machine.ts`)
No se delega la seguridad financiera únicamente al System Prompt. El código valida deterministamente el ciclo de vida de la orden:
- **Estados**: `'NONE'` → `'AWAITING_CONFIRMATION'` → `'CONFIRMED'` → `'COMPLETED'` (o `'CANCELLED'`).
- **Condiciones obligatorias para emitir la orden**:
  1. La operación debe encontrarse en estado `CONFIRMED` tras una confirmación inequívoca en el turno actual.
  2. Respuestas ambiguas (*"tal vez"*, *"déjame ver"*, *"creo que sí pero no estoy seguro"*), condicionales (*"sí, pero solo si llegan mañana"*) o con preguntas (*"¿cuánto cuestan?"*) mantienen el estado en `AWAITING_CONFIRMATION` e impiden la compra.
  3. Mensajes con negación o desistimiento (*"sí, mejor no"*, *"no, cancela"*) transicionan a `CANCELLED`.
  4. El producto y la cantidad deben coincidir exactamente con el faltante calculado:
     $$\text{cantidad} = \text{missingQuantity} = \max(0, \text{requiredQuantity} - \text{availableStock})$$
  5. Una vez emitida, la orden pasa a `COMPLETED`, impidiendo órdenes duplicadas o re-ejecuciones.

---

## 📋 Auditoría del Inventario Desestructurado (`INVENTORY_SOURCE=unstructured`)

El repositorio incluye el archivo original en [`data/notas_de_inventario_desestructuradas.txt`](data/notas_de_inventario_desestructuradas.txt), consolidando la siguiente tabla auditada:

| Producto | Físico | Disponible | Reservado | Despachado | Defectuoso / En Rep. | Pendiente Recepción | Notas de Trazabilidad / Incertidumbre |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Laptops ThinkPad** | 15 | **15** | 0 | 0 | 3 def. | 0 | 15 manifiesto - 3 devueltas + 5 marketing - 2 robadas = 15 funcionales. |
| **Mouses Logitech** | 47 | **47** | 0 | 15 | 0 | 0 | 12 sueltos + 50 palet - 15 enviados a Viña del Mar. |
| **Monitores Dell 27"** | 18 | **18** | 0 | 0 | 0 | 0 | 8 en Sector B + 10 camión. Los 2 de RRHH fueron liberados por cancelación. |
| **Teclados KeyClickers** | 15 | **15** | 0 | 0 | 10 def. | 0 | 25 contados - 4 tecla rota - 6 arruinados por gotera = 15 OK. |
| **Cables HDMI** | 40 | **40** | 0 | 0 | 0 | 0 | **Estimado**: "Enredo en cajón 3, asumamos 40 por ahora". |
| **Sillas ergonómicas** | 0 | **0** | 0 | 0 | 0 | 10 | Stock físico 0. Pedido retenido en aduana hasta el próximo mes. |
| **Headsets Jabra** | 19 | **19** | 0 | 81 | 0 | 0 | 100 recibidos - 80 a piso 4 - 1 retirado por bodeguero = 19 en bodega. |
| **Docking Stations Lenovo** | 2 | **2** | 0 | 0 | 0 | 8 | 2 en bodega física; 8 en camión desde sucursal Norte sin recepción física aún. |
| **Proyectores Epson** | 0 | **0** | 0 | 0 | 1 rep. | 2 | 3 en camión: 2 operativos pendientes recepción + 1 sin lámpara (reparable). |
| **Máquina café Nespresso** | 0 | **0** | 0 | 0 | 0 | 0 | Excluida de TI; va directo a cocina piso 4. |
| **Tinta Epson Negra** | 13 | **13** | 0 | 4 | 0 | 0 | 12 Excel viejo + 5 recibidas - 4 retiradas por Marketing = 13. |
| **Tinta Epson Magenta** | 6 | **6** | 0 | 2 | 0 | 0 | 3 Excel viejo + 5 recibidas - 2 retiradas por Marketing = 6. |
| **Tinta Epson Cyan** | 5 | **5** | 0 | 0 | 0 | 0 | 0 Excel viejo + 5 nuevas recibidas = 5. |
| **Tinta Epson Amarilla** | 5 | **5** | 0 | 0 | 0 | 0 | 0 Excel viejo + 5 nuevas recibidas = 5. |
| **SSD 1TB Kingston** | 0 | **0** | 0 | 0 | 0 | 20 | Comprados el 16 Oct sin confirmación de recepción física en bodega. |
| **Adaptadores USB-C a HDMI** | 15 | **15** | 0 | 15 | 0 | 0 | **Estimado**: ~20 iniciales - 15 Ventas + 10 en bolsa sellada = ~15. |
| **Standing Desks** | 3 | **3** | 0 | 0 | 1 def. | 0 | 4 recibidos - 1 con motor destruido = 3 operativos. |
| **iPhone 15** | 9 | **9** | 0 | 3 | 0 | 0 | 12 en vitrina - 3 entregados a Desarrollo (clasificados como despachados). |
| **Samsung Galaxy S24** | 3 | **3** | 0 | 2 | 0 | 0 | 5 en vitrina - 2 entregados a Desarrollo (clasificados como despachados). |
| **Poleras logo viejo** | 100 | **0** | 0 | 0 | 0 | 0 | Destinadas a donación de caridad; no computables para uso interno. |
| **Poleras logo nuevo** | 125 | **125** | 0 | 0 | 0 | 0 | 50 talla S, 45 talla M, 30 talla L disponibles. |
| **Tazas térmicas** | 62 | **62** | 0 | 20 | 0 | 0 | 82 contadas - 20 retiradas por Ventas. |
| **Cuadernos institucionales** | 100 | **100** | 0 | 20 | 0 | 0 | 120 contados - 20 retirados por Ventas. |
| **Mochilas corporativas** | 30 | **30** | 0 | 10 | 0 | 0 | 40 contadas - 10 retiradas por Ventas. |
| **Webcams Logitech C920** | 6 | **6** | 0 | 0 | 1 def. | 0 | 7 iniciales - 1 rota hoy por Felipe M. = 6 disponibles. |
| **Licencias Windows Server** | 4 | **4** | 0 | 0 | 0 | 0 | **Autorización especial**: Requiere firma obligatoria del Gerente TI. |
| **Licencias Office 2021** | 15 | **15** | 0 | 0 | 0 | 0 | **Autorización especial**: Requiere firma obligatoria del Gerente TI. |
| **Cable de red Cat6 (m)** | 700 | **700** | 0 | 300 | 0 | 0 | **Estimado**: Rollo 1000m - ~300m cortados para piso 2 = ~700m aprox. |
| **Conectores RJ45** | 50 | **50** | 0 | 0 | 0 | 0 | **Estimado**: "Quedan como 50 sueltos nada más". |
| **Switch Cisco 48p** | 4 | **3** | 1 | 0 | 0 | 0 | 4 físicas en Rack 1; 1 unidad reservada para viernes en piso 3 = 3 disponibles. |
| **Switch Ubiquiti 24p** | 2 | **2** | 0 | 0 | 1 def. | 0 | 2 unidades OK en Rack 1; 1 unidad quemada en pasillo dada de baja. |
| **Servidor Dell R740** | 3 | **3** | 0 | 0 | 0 | 0 | 3 unidades OK en Rack 2. |
| **Servidor HP ProLiant** | 0 | **0** | 0 | 0 | 2 rep. | 0 | 0 físicos en bodega; 2 unidades en servicio técnico externo (reparables). |
| **Router Mikrotik** | 5 | **5** | 0 | 0 | 0 | 0 | 5 unidades OK en Bodega B. |

---

## 🚀 Puesta en Marcha

### Prerrequisitos
- Node.js versión **>= 20.0.0**
- npm versión **>= 9.0.0**

### 1. Instalación
Clona el repositorio e instala las dependencias:
```bash
git clone https://github.com/tu-usuario/agente-logistico-gemini.git
cd agente-logistico-gemini
npm install
```

### 2. Configuración de Variables de Entorno
Copia el archivo de ejemplo y configura tu API Key:
```bash
cp .env.example .env
```
Edita `.env` con tus credenciales:
```ini
# Clave de API de Google AI Studio
GEMINI_API_KEY=tu_api_key_aqui

# Modelo (recomendado: gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash

# Fuente de datos inicial: 'mock' (PDF test) o 'unstructured' (inventario auditado)
INVENTORY_SOURCE=mock
```

### 3. Compilación TypeScript
Verifica la compilación estricta sin errores:
```bash
npm run build
```

---

## 💻 Ejecución del Agente CLI

Inicia el agente interactivo con:
```bash
npm start
```

### Comandos Interactivos Disponibles en la Consola:
- `mode mock`: Cambia inmediatamente al repositorio Mock (genera stock aleatorio consistente 1-5 para reproducir el escenario del PDF).
- `mode unstructured`: Cambia al repositorio auditado de 26+ categorías del documento desestructurado.
- `status`: Muestra el estado en memoria de la máquina de estados y la orden pendiente.
- `reset`: Reinicia la sesión de chat y borra la máquina de estados.
- `salir` o `exit`: Finaliza la sesión.

---

## 🧪 Pruebas Automatizadas

La suite de pruebas incluye cobertura completa de dominio, máquina de estados, validadores y el flujo conversacional.

### Ejecutar todas las pruebas:
```bash
npm test
```

### Ejecutar únicamente pruebas unitarias offline:
```bash
npm run test:unit
```
Valida 33 especificaciones exhaustivas:
- Consistencia del mock aleatorio (1-5) por sesión.
- Trazabilidad y desglose de las 26+ categorías de inventario.
- Máquina de estados: detección de ambigüedad, condiciones, preguntas y cancelaciones.
- Validación de cantidad exacta y prevención estricta de órdenes duplicadas.
- Rechazo de herramientas y argumentos alucinados o inválidos.

### Ejecutar prueba de integración con Gemini (requiere `GEMINI_API_KEY`):
```bash
npm run test:integration
```
Verifica el flujo conversacional real en 3 turnos:
1. **Turno 1**: Solicitud de 10 laptops $\rightarrow$ Gemini invoca `consultar_stock` y ofrece comprar los faltantes sin emitir la orden.
2. **Turno 2**: Respuesta ambigua con pregunta $\rightarrow$ Gemini responde sin emitir la orden de compra.
3. **Turno 3**: Confirmación inequívoca $\rightarrow$ Gemini invoca `emitir_orden_compra` por la cantidad exacta calculada.

---

## 🛡️ Licencia
Distribuido bajo la licencia MIT.
