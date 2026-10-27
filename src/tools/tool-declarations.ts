import { FunctionDeclaration, Tool, Type } from '@google/genai';

export const consultarStockDeclaration: FunctionDeclaration = {
  name: 'consultar_stock',
  description: 'Consulta el stock disponible para asignación inmediata de un producto en bodega.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      producto: {
        type: Type.STRING,
        description: 'Nombre o descripción del producto a consultar en el inventario (ej. "Laptops ThinkPad", "Monitores Dell 27", "Mouses Logitech").'
      }
    },
    required: ['producto']
  }
};

export const emitirOrdenCompraDeclaration: FunctionDeclaration = {
  name: 'emitir_orden_compra',
  description: 'Emite una orden de compra oficial en el sistema para reponer unidades faltantes. Requiere autorización y confirmación inequívoca previa del usuario.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      producto: {
        type: Type.STRING,
        description: 'Nombre del producto a reponer mediante la orden de compra.'
      },
      cantidad: {
        type: Type.INTEGER,
        description: 'Cantidad exacta de unidades faltantes a comprar (entero positivo igual al faltante calculado).'
      }
    },
    required: ['producto', 'cantidad']
  }
};

export const agentTools: Tool[] = [
  {
    functionDeclarations: [
      consultarStockDeclaration,
      emitirOrdenCompraDeclaration
    ]
  }
];
