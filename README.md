## Autor

Boris Javier Mejías Díaz

# Agente Logístico LLM

Agente conversacional para consultar inventarios y gestionar órdenes de compra mediante modelos de lenguaje (LLM). El proyecto fue desarrollado en TypeScript, con soporte para Google Gemini y OpenAI, tanto en consola (CLI) como en una interfaz web.

## Funcionalidades

El proyecto implementa las tres etapas del desafío original:

1. **Agente especializado:** responde consultas de logística e inventario y rechaza solicitudes fuera de este ámbito.
2. **Function Calling:** utiliza las herramientas `consultar_stock` y `emitir_orden_compra` para verificar existencias y registrar órdenes.
3. **Conversaciones con contexto:** calcula el faltante de productos y solicita autorización explícita antes de emitir una orden de compra.

Se incorporaron además las siguientes funcionalidades:

- Interfaz web con selección entre Gemini y OpenAI.
- Dos modos de inventario: **Mock** (stock simulado de 1 a 5 unidades) y **Auditoría Documental** (con 34 productos).
- Prevención de compras duplicadas y rechazo de confirmaciones ambiguas.
- Gestión de sesiones y control de concurrencia mediante Upstash Redis.
- Arquitectura BYOK (*Bring Your Own Key*): cada usuario proporciona su propia API Key, sin almacenarla de forma persistente.

## Manejo del historial de conversación

El agente conserva el historial de mensajes de cada sesión para mantener el contexto entre las consultas del usuario y las respuestas del modelo. Esto permite recordar productos consultados, cantidades solicitadas y operaciones pendientes de confirmación, sin perder la continuidad de la conversación.

Para controlar las órdenes de compra, se utiliza una máquina de estados que verifica las autorizaciones antes de ejecutar cualquier operación. En la versión web, Upstash Redis permite mantener las sesiones entre distintas solicitudes, evitando la pérdida de contexto cuando la aplicación se ejecuta en Vercel.

## Tecnologías utilizadas

- **Backend / CLI:** Node.js 24 LTS, TypeScript.
- **Frontend:** Next.js 15, React 19, Tailwind CSS.
- **Inteligencia artificial:** Google Gemini (`@google/genai`) y OpenAI (`openai`).
- **Persistencia:** Upstash Redis.
- **Pruebas:** Vitest.

## Instalación y ejecución local

Requiere Node.js 24 LTS y npm.

```bash
git clone https://github.com/BorisMejiasII/agente-logistico-gemini.git
cd agente-logistico-gemini
npm install
npm install --prefix web
```

========================================================================================

### Ejecución en consola (CLI)

Copia `.env.example` a `.env` y configura tu clave `GEMINI_API_KEY`.

```bash
npm start
```
========================================================================================

### Ejecución de la interfaz web

```bash
npm run web:dev
```

Abre `http://localhost:3000` e ingresa tu API Key desde la configuración de la aplicación.

## Pruebas automatizadas

```bash
npm run test:unit
npm run test:web
npm run test:redis
npm run build
npm run web:build
```

Las pruebas de integración con Upstash Redis requieren sus credenciales configuradas en el entorno. Sin ellas, se ejecutan únicamente las pruebas locales correspondientes.

## Despliegue en Vercel

Puedes probar el Agente Logístico directamente desde la aplicación desplegada en Vercel, sin necesidad de instalar el proyecto.

**Enlace:** Pendiente de publicación.

Para utilizarla, necesitas proporcionar una API Key válida de Gemini u OpenAI.

## Limitaciones conocidas

- Gemini ha sido probado mediante conversaciones reales. OpenAI está implementado y validado mediante pruebas simuladas, pero su ejecución completa con la API real sigue pendiente por falta de créditos en la cuenta de pruebas.

