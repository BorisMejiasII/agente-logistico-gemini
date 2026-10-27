Desarrollado por: Boris Mejías Díaz

======================================================
AGENTE CONVERSACIONAL DE LOGÍSTICA E INVENTARIO
====================================================

Agente de consola (CLI) desarrollado en Node.js y TypeScript para la gestión asistida de inventarios y la emisión simulada de órdenes de compra. Utiliza Function Calling nativo de Gemini y una máquina de estados determinista para validar las operaciones antes de ejecutarlas.


1. TECNOLOGÍAS
---------------

- Node.js: versión 20 o superior.
- TypeScript: tipado estricto.
- Google Gemini: SDK oficial @google/genai.
- Modelo utilizado en las pruebas: gemini-3.5-flash-lite.
- Vitest: pruebas unitarias y de integración.


2. INSTALACIÓN Y CONFIGURACIÓN
-------------------------------

2.1. Instalar dependencias

Desde la carpeta raíz del proyecto, ejecutar:

    npm install


2.2. Configurar la API Key

Crear el archivo .env a partir de la plantilla incluida.
En PowerShell (Windows):

    Copy-Item .env.example .env

Editar el archivo .env con los siguientes valores:

    GEMINI_API_KEY=tu_api_key_aqui
    GEMINI_MODEL=gemini-3.5-flash-lite
    INVENTORY_SOURCE=mock

La API Key se obtiene desde:
https://aistudio.google.com/apikey

No compartir ni subir el archivo .env al repositorio.


2.3. Compilar el proyecto

    npm run build


3. EJECUCIÓN
------------

Iniciar el agente desde la terminal:

    npm start

Una vez iniciada la consola, se puede interactuar con el agente mediante lenguaje natural.

Ejemplo de consulta:

    Necesitamos equipar a 10 nuevos empleados con laptops.

El agente consulta el stock mediante Function Calling, calcula las unidades faltantes y solicita confirmación antes de emitir una orden de compra simulada.


3.1. Comandos a utilizar al momento de la ejecución

- mode mock: Activa el inventario simulado con stock aleatorio de 1 a 5 unidades, consistente por producto durante la sesión.

- mode unstructured: Activa el inventario consolidado a partir de registros documentales.

- status: Muestra el estado de la operación de compra pendiente.

- reset: Reinicia el contexto conversacional y las operaciones pendientes.

- salir o exit: Finaliza la aplicación, no es necesario terminar la ejecución con Cntl+C.


Nota sobre el inventario documental:

El modo unstructured utiliza una representación tipada en memoria, consolidada previamente a partir de registros heterogéneos de inventario. No realiza procesamiento dinámico del archivo TXT; por lo tanto, modificar el documento original no actualiza automáticamente las existencias del sistema.


4. FUNCIONALIDADES PRINCIPALES
-------------------------------

- Function Calling nativo: Integración de las herramientas consultar_stock y emitir_orden_compra mediante las declaraciones oficiales del SDK de Gemini.

- Control de órdenes: Validación del producto, cantidad solicitada, stock disponible y confirmación explícita del usuario antes de ejecutar una compra simulada.

- Máquina de estados: Prevención de operaciones no autorizadas, confirmaciones ambiguas y órdenes duplicadas.

- Restricción de dominio: Rechazo de consultas ajenas a logística e inventarios, como programación general, clima o entretenimiento.

- Resiliencia: Reintentos controlados ante errores transitorios de la API mediante Exponential Backoff y Jitter.


5. ESTRATEGIA DE MANEJO DE MEMORIA E HISTORIAL
-----------------------------------------------

El agente utiliza una sesión conversacional persistente del SDK @google/genai, que mantiene el historial de mensajes del usuario, respuestas del modelo, llamadas a herramientas y resultados de Function Calling. Esto permite conservar el contexto entre diferentes turnos de una misma conversación. La capa de resiliencia gestiona los reintentos ante fallos transitorios de comunicación, mientras que el controlador mantiene la coherencia del historial y evita la repetición de operaciones locales ya ejecutadas.

El historial conversacional se complementa con una máquina de estados determinista local (OrderStateMachine), encargada de almacenar la información crítica de las operaciones pendientes, incluyendo producto, cantidad requerida, stock disponible y unidades faltantes. Las autorizaciones se validan independientemente del modelo, se invalidan cuando cambian los datos relevantes de la solicitud y se consumen después de ejecutar una orden, evitando reutilizar confirmaciones anteriores.


6. PRUEBAS AUTOMATIZADAS
-------------------------

El proyecto utiliza Vitest para verificar la lógica de inventario, las restricciones del agente, la máquina de estados y la integración con Gemini.


6.1. Pruebas unitarias

Se realizaron multiples pruebas para revisar la fiablidad del proyecto, estas;

Se ejecutan sin conexión a la API de Gemini:

    npm run test:unit


6.2. Pruebas de integración

Requieren una API Key válida y acceso a Gemini:

    npm run test:integration

Incluyen dos escenarios:

1. Flujo conversacional multi-turno para equipar a 10 empleados con laptops, incluyendo consulta de stock, cálculo del faltante, confirmación y emisión de orden.

2. Validación de restricciones de dominio mediante consultas fuera de contexto y consultas legítimas de inventario.

Último resultado registrado: 2 pruebas aprobadas.


6.3. Ejecutar todas las pruebas

    npm test

