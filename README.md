Desarrollado por: Boris Mejías Díaz

==============================================================================
AGENTE CONVERSACIONAL DE LOGÍSTICA E INVENTARIO — CLI & FRONTEND MULTIPROVEEDOR
==============================================================================

Sistema conversacional desarrollado en TypeScript para la gestión de inventarios y la emisión determinista de órdenes de compra. Reutiliza un único núcleo de dominio logístico tanto en una interfaz de consola (CLI) como en una aplicación web moderna (Next.js App Router) desplegable en Vercel, compatible con Google Gemini y OpenAI.


1. ARQUITECTURA Y TECNOLOGÍAS
-----------------------------

- Runtime & Lenguaje: Node.js 20+ y TypeScript con tipado estricto.
- Proveedores de Inteligencia Artificial:
  * Google Gemini: SDK oficial `@google/genai` (modelo por defecto: `gemini-3.5-flash-lite`).
  * OpenAI: SDK oficial `openai` con Function Calling nativo (modelo por defecto: `gpt-4o-mini`).
- Abstracción de Proveedor: Interfaz unificada `ILLMProvider` que comparte las mismas herramientas, repositorio de inventario y máquina de estados.
- Frontend Web: Next.js (App Router), React 19 y Tailwind CSS.
- Persistencia de Sesiones Serverless: Compatible con Redis (`@upstash/redis`) para instancias distribuidas en Vercel, con adaptador en memoria (`InMemorySessionStore`) para desarrollo y pruebas locales.
- Pruebas Automatizadas: Vitest con 70 pruebas automatizadas (unitarias, resiliencia, multi-proveedor e integración en vivo).


2. INSTALACIÓN Y EJECUCIÓN LOCAL
---------------------------------

2.1. Instalación de dependencias

Desde la raíz del repositorio:

    npm install
    npm install --prefix web

2.2. Ejecución de la Consola (CLI Original)

El agente CLI original se conserva al 100% sin modificaciones disruptivas:

1. Configura tu archivo `.env` en la raíz copiando la plantilla:
   
   En PowerShell (Windows):
   Copy-Item .env.example .env

2. Define tu clave de Google Gemini:
   GEMINI_API_KEY=tu_api_key_aqui
   GEMINI_MODEL=gemini-3.5-flash-lite
   INVENTORY_SOURCE=mock

3. Inicia la consola:
   npm start

Comandos disponibles en la consola:
- `mode mock`: Activa inventario aleatorio consistente (1 a 5 unidades por sesión).
- `mode unstructured`: Activa inventario auditado con trazabilidad documental.
- `status`: Muestra la operación de compra pendiente.
- `reset`: Reinicia la sesión y la máquina de estados.
- `salir` o `exit`: Cierra la aplicación.

2.3. Ejecución de la Aplicación Web (Next.js)

Para iniciar el servidor de desarrollo web:

    npm run web:dev

Abre tu navegador en: http://localhost:3000

Para compilar la versión de producción web localmente:

    npm run web:build
    npm run web:start


3. USO DE LA INTERFAZ WEB
-------------------------

3.1. Configuración de API Keys (Enfoque BYOK)
- Haz clic en el botón superior derecho "Claves API".
- Ingresa de manera independiente tu API Key de Google Gemini, tu API Key de OpenAI, o ambas.
- Los campos son tipo contraseña con opción de mostrar/ocultar.
- Puedes presionar "Verificar Conexión" para validar que la clave sea aceptada por el proveedor sin consumir cuotas de generación.
- El botón "Limpiar de memoria" destruye inmediatamente la referencia en RAM.
- El chat se habilita automáticamente solo cuando el proveedor activo cuenta con una clave configurada.

3.2. Selección de Proveedor (Gemini u OpenAI)
- En la barra superior de controles, alterna entre "Gemini" y "OpenAI".
- El cambio es inmediato y verifica la disponibilidad de la clave respectiva.
- Protección de Seguridad: Si existe una operación de compra pendiente de autorización, el sistema advierte que el cambio reiniciará el contexto para evitar traslape o reutilización indebida de autorizaciones entre modelos.

3.3. Selección de Fuente de Inventario
- Alterna entre:
  * "Mock (1-5 unidades PDF)": Simula el escenario del challenge con stock aleatorio consistente por producto en la sesión.
  * "Auditoría Documental": Emplea los registros consolidados con trazabilidad física, reservas, equipos defectuosos y retenciones.
- Cambiar de inventario invalida compras pendientes e inicia un nuevo contexto conversacional.


4. SEGURIDAD Y PRIVACIDAD DE CREDENCIALES
-----------------------------------------

La aplicación implementa una estricta política de protección Bring Your Own Key (BYOK):

1. Memoria Volátil: Las API Keys se mantienen exclusivamente en la memoria de estado del navegador (React State) durante la sesión de la pestaña.
2. Sin Almacenamiento Persistente en Cliente: NUNCA se guardan en `localStorage`, `sessionStorage`, `cookies` ni `IndexedDB`.
3. Sin Almacenamiento en Servidor: Las claves NO se almacenan en Redis, archivos de base de datos ni variables de entorno públicas (`NEXT_PUBLIC_*`).
4. Transporte Seguro: Se transmiten únicamente en el cuerpo de solicitudes HTTP POST hacia los endpoints serverless correspondientes.
5. Cero Fuga en Logs: Ninguna traza, consola, respuesta HTTP o mensaje de error imprime o retorna las API Keys.
6. Aislamiento Criptográfico de Sesiones: Cada sesión se identifica por un `sessionId` (UUID) y se protege con un `sessionSecret` criptográfico de 48 caracteres. No es posible acceder o manipular sesiones ajenas sin el secreto correspondiente.
7. Control de Concurrencia e Idempotencia: Bloqueos atómicos de sesión evitan dobles confirmaciones simultáneas y retransmisiones duplicadas mediante `clientMessageId`.


5. PERSISTENCIA EN DESPLIEGUES SERVERLESS (VERCEL)
---------------------------------------------------

En entornos serverless como Vercel, las funciones se ejecutan en instancias efímeras e independientes. Para garantizar que el historial y la máquina de estados persistan correctamente entre diferentes solicitudes HTTP:

- Producción (Vercel): Se utiliza almacenamiento externo compatible con Redis, preferentemente Upstash Redis.
- Desarrollo Local: Se activa automáticamente el almacenamiento en memoria (`InMemorySessionStore`) sin requerir configuración adicional.

Para configurar Upstash Redis en producción:
1. Crea una base de datos gratuita en https://console.upstash.com/
2. Obtén la URL y el Token REST.
3. En Vercel, agrega las siguientes variables de entorno:
   * `UPSTASH_REDIS_REST_URL`
   * `UPSTASH_REDIS_REST_TOKEN`


6. GUÍA DE DESPLIEGUE EN VERCEL
--------------------------------

Para desplegar la aplicación desde GitHub a Vercel:

1. Inicia sesión en https://vercel.com y selecciona "Add New Project".
2. Importa el repositorio `agente-logistico-gemini`.
3. Configura los ajustes del proyecto (Project Settings):
   * Root Directory: Haz clic en "Edit" y selecciona la carpeta `web`.
   * Framework Preset: Next.js (se detecta automáticamente).
   * Build Command: `next build` (predeterminado).
   * Output Directory: `.next` (predeterminado).
4. En la sección "Environment Variables", añade las credenciales de Upstash Redis:
   * `UPSTASH_REDIS_REST_URL`: URL REST de tu base de datos Upstash.
   * `UPSTASH_REDIS_REST_TOKEN`: Token REST de tu base de datos Upstash.
   * Opcional: `GEMINI_MODEL=gemini-3.5-flash-lite`
   * Opcional: `OPENAI_MODEL=gpt-4o-mini`
5. Haz clic en "Deploy".
6. Una vez completado, Vercel proporcionará una URL pública protegida con HTTPS.


7. PRUEBAS AUTOMATIZADAS
-------------------------

El proyecto cuenta con 4 suites de pruebas con 70 pruebas en total:

7.1. Pruebas Unitarias de Dominio y Máquina de Estados (53 pruebas)
Valida la máquina de estados, el inventario mock, el inventario documental, las validaciones deterministas y la política de reintentos con backoff exponencial:

    npm run test:unit

7.2. Pruebas de Arquitectura Web y Multi-Proveedor (15 pruebas)
Valida el registro de herramientas en OpenAI y Gemini, el adaptador simulado de OpenAI, el aislamiento de sesiones, la prevención de reutilización de autorizaciones, el control de concurrencia, la idempotencia y la integración multi-turno en vivo:

    npm run test:web

7.3. Pruebas de Integración en Vivo con Gemini (2 pruebas)
Ejecuta el flujo multi-turno de 10 laptops y las restricciones de dominio contra la API de Google Gemini (requiere `GEMINI_API_KEY` en `.env`):

    npm run test:integration

7.4. Ejecución Completa
Ejecuta secuencialmente todas las suites respetando la tasa de llamadas de la API:

    npm test


8. LIMITACIONES CONOCIDAS
-------------------------

1. Cuotas de la API Gratuita de Google: La capa gratuita de Google AI Studio impone un límite de 15 solicitudes por minuto (RPM). Si se envían múltiples mensajes rápidos consecutivos, la API puede retornar un error 429 transitorio.
2. Memoria Volátil BYOK: Al tratarse de una implementación técnica de demostración, las credenciales no persisten al cerrar o recargar la pestaña del navegador por diseño estricto de seguridad.
3. Almacenamiento en Memoria Local: Si no se configura Upstash Redis en Vercel, la aplicación utilizará almacenamiento en memoria, lo cual en un entorno multi-instancia serverless puede provocar pérdida de contexto entre solicitudes atendidas por distintas instancias. Para producción en Vercel, es indispensable configurar Upstash Redis.
