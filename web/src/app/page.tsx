'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Header';
import { SettingsModal, KeyVerificationState } from '../components/SettingsModal';
import { ProviderSelector } from '../components/ProviderSelector';
import { InventorySelector } from '../components/InventorySelector';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { PendingOrderBanner } from '../components/PendingOrderBanner';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { StoredChatMessage } from '../../../src/providers/provider.interface.js';
import { PendingOrder } from '../../../src/domain/inventory.types.js';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  variant: 'warning' | 'danger' | 'primary';
  isLoading?: boolean;
  onConfirm: () => Promise<void> | void;
}

export default function Home() {
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openAIKey, setOpenAIKey] = useState<string>('');

  const [geminiStatus, setGeminiStatus] = useState<KeyVerificationState>('idle');
  const [openAIStatus, setOpenAIStatus] = useState<KeyVerificationState>('idle');
  const [geminiStatusMsg, setGeminiStatusMsg] = useState<string>('');
  const [openAIStatusMsg, setOpenAIStatusMsg] = useState<string>('');

  // Configuración de la sesión
  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini');
  const [inventoryMode, setInventoryMode] = useState<'mock' | 'unstructured'>('mock');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSecret, setSessionSecret] = useState<string | null>(null);

  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);

  // Estados de UI
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado del Modal de Confirmación Accesible 
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    variant: 'warning',
    isLoading: false,
    onConfirm: () => {}
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeKey = provider === 'gemini' ? geminiKey : openAIKey;
  const isKeyConfigured = Boolean(activeKey && activeKey.trim().length > 0);
  const isKeyVerified = provider === 'gemini' ? geminiStatus === 'verified' : openAIStatus === 'verified';

  // Inicializar sesión al cargar la página
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', provider: 'gemini', inventoryMode: 'mock' })
        });
        const data = await res.json();
        if (data.sessionId && data.sessionSecret) {
          setSessionId(data.sessionId);
          setSessionSecret(data.sessionSecret);
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content:
                '¡Hola! Soy tu **Agente Especialista en Logística, Abastecimiento y Control de Inventarios**.\n\n' +
                'Puedo ayudarte a:\n' +
                '- **Consultar existencias exactas en bodega** mediante herramientas nativas de inventario.\n' +
                '- **Calcular faltantes de dotación** para nuevos empleados o proyectos.\n' +
                '- **Emitir órdenes de compra simuladas**, requiriendo siempre tu confirmación previa y explícita.\n\n' +
                'Para comenzar a chatear, recuerda ingresar tu API Key en **Claves API** arriba a la derecha.',
              timestamp: new Date().toISOString()
            }
          ]);
        }
      } catch (err) {
        console.error('Error al inicializar sesión:', err);
      }
    }

    initSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleVerifyKey = async (targetProvider: 'gemini' | 'openai') => {
    const key = targetProvider === 'gemini' ? geminiKey : openAIKey;
    if (!key) return;

    if (targetProvider === 'gemini') {
      setGeminiStatus('verifying');
      setGeminiStatusMsg('');
    } else {
      setOpenAIStatus('verifying');
      setOpenAIStatusMsg('');
    }

    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider, apiKey: key.trim() })
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        if (targetProvider === 'gemini') {
          setGeminiStatus('verified');
          setGeminiStatusMsg('✓ Conexión establecida con éxito.');
        } else {
          setOpenAIStatus('verified');
          setOpenAIStatusMsg('✓ Conexión establecida con éxito.');
        }
      } else {
        if (targetProvider === 'gemini') {
          setGeminiStatus('error');
          setGeminiStatusMsg(data.error || data.message || 'Clave rechazada por la API.');
        } else {
          setOpenAIStatus('error');
          setOpenAIStatusMsg(data.error || data.message || 'Clave rechazada por la API.');
        }
      }
    } catch {
      if (targetProvider === 'gemini') {
        setGeminiStatus('error');
        setGeminiStatusMsg('Error de conexión con el servidor.');
      } else {
        setOpenAIStatus('error');
        setOpenAIStatusMsg('Error de conexión con el servidor.');
      }
    }
  };

  const executeProviderSwitch = async (newProvider: 'gemini' | 'openai') => {
    setProvider(newProvider);
    setErrorMessage(null);

    if (sessionId && sessionSecret) {
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            sessionId,
            sessionSecret,
            provider: newProvider
          })
        });
        setPendingOrder(null);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Has cambiado al proveedor **${newProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}**. Cualquier autorización pendiente ha sido reiniciada por seguridad.`,
            timestamp: new Date().toISOString()
          }
        ]);
      } catch (err) {
        console.error('Error al actualizar proveedor:', err);
      }
    }
  };

  const handleRequestProviderSwitch = (newProvider: 'gemini' | 'openai') => {
    if (pendingOrder?.state === 'AWAITING_CONFIRMATION') {
      setConfirmDialog({
        isOpen: true,
        title: '¿Cambiar proveedor de IA?',
        description:
          'Tienes una operación de compra pendiente de autorización. Si cambias de proveedor, se reiniciará el contexto de la conversación para garantizar que la autorización no sea reutilizada indebidamente.',
        confirmText: 'Cambiar proveedor',
        cancelText: 'Cancelar',
        variant: 'warning',
        isLoading: false,
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }));
          await executeProviderSwitch(newProvider);
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
      });
      return;
    }
    executeProviderSwitch(newProvider);
  };

  const executeInventorySwitch = async (newMode: 'mock' | 'unstructured') => {
    setInventoryMode(newMode);
    setErrorMessage(null);

    if (sessionId && sessionSecret) {
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            sessionId,
            sessionSecret,
            inventoryMode: newMode
          })
        });
        setPendingOrder(null);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Fuente de inventario cambiada a **${newMode === 'mock' ? 'Mock Aleatorio (1-5 unidades consistentemente)' : 'Auditoría Documental'}**. Las existencias y compras previas han sido reiniciadas.`,
            timestamp: new Date().toISOString()
          }
        ]);
      } catch (err) {
        console.error('Error al actualizar inventario:', err);
      }
    }
  };

  const handleRequestInventorySwitch = (newMode: 'mock' | 'unstructured') => {
    if (pendingOrder?.state === 'AWAITING_CONFIRMATION') {
      setConfirmDialog({
        isOpen: true,
        title: '¿Cambiar fuente de inventario?',
        description:
          'Tienes una operación de compra pendiente de autorización. Si cambias la fuente de inventario, se reiniciará la conversación y se descartará la operación pendiente.',
        confirmText: 'Cambiar inventario',
        cancelText: 'Cancelar',
        variant: 'warning',
        isLoading: false,
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }));
          await executeInventorySwitch(newMode);
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
      });
      return;
    }
    executeInventorySwitch(newMode);
  };

  const executeResetConversation = async () => {
    if (!sessionId || !sessionSecret) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', sessionId, sessionSecret })
      });
      setPendingOrder(null);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sesión reiniciada. Se han restablecido el historial conversacional y la máquina de compras.',
          timestamp: new Date().toISOString()
        }
      ]);
    } catch {
      setErrorMessage('Error al reiniciar la sesión.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestResetConversation = () => {
    if (pendingOrder?.state === 'AWAITING_CONFIRMATION' || messages.length > 2) {
      setConfirmDialog({
        isOpen: true,
        title: '¿Reiniciar la sesión conversacional?',
        description:
          'Esta acción limpiará todos los mensajes del chat y descartará cualquier operación de compra en curso. ¿Deseas continuar?',
        confirmText: 'Reiniciar sesión',
        cancelText: 'Cancelar',
        variant: 'danger',
        isLoading: false,
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, isLoading: true }));
          await executeResetConversation();
          setConfirmDialog(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
      });
      return;
    }
    executeResetConversation();
  };

  // Enviar mensaje al agente
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isLoading) return;

    if (!isKeyConfigured) {
      setIsSettingsOpen(true);
      setErrorMessage(`Debes ingresar una API Key para ${provider.toUpperCase()} antes de enviar mensajes.`);
      return;
    }

    if (!sessionId || !sessionSecret) {
      setErrorMessage('La sesión no está inicializada. Por favor recarga la página.');
      return;
    }

    const userMsg: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    setErrorMessage(null);

    const clientMessageId = crypto.randomUUID();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sessionSecret,
          message: text,
          apiKey: activeKey.trim(),
          clientMessageId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al comunicarse con el agente.');
      }

      const assistantMsg: StoredChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.text,
        timestamp: new Date().toISOString(),
        toolCalls: data.toolCallsExecuted
      };

      setMessages(prev => [...prev, assistantMsg]);
      setPendingOrder(data.pendingOrder || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Encabezado */}
      <Header
        provider={provider}
        isKeyConfigured={isKeyConfigured}
        isKeyVerified={isKeyVerified}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRequestReset={handleRequestResetConversation}
        isLoading={isLoading}
      />

      {/* Modal Accesible de Confirmación para Operaciones Destructivas */}
      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
        isLoading={confirmDialog.isLoading}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Modal de Configuración de Credenciales */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        geminiKey={geminiKey}
        openAIKey={openAIKey}
        onUpdateGeminiKey={key => {
          setGeminiKey(key);
          setGeminiStatus('idle');
          setGeminiStatusMsg('');
        }}
        onUpdateOpenAIKey={key => {
          setOpenAIKey(key);
          setOpenAIStatus('idle');
          setOpenAIStatusMsg('');
        }}
        geminiStatus={geminiStatus}
        openAIStatus={openAIStatus}
        onVerifyKey={handleVerifyKey}
        statusMessageGemini={geminiStatusMsg}
        statusMessageOpenAI={openAIStatusMsg}
      />

      {/* Contenedor Principal */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 flex flex-col justify-between">
        {/* Controles de Configuración Operativa */}
        <div className="space-y-2.5 mb-3">
          <ProviderSelector
            currentProvider={provider}
            onSelectProvider={executeProviderSwitch}
            onRequestSwitchWithPendingOrder={handleRequestProviderSwitch}
            hasGeminiKey={Boolean(geminiKey)}
            hasOpenAIKey={Boolean(openAIKey)}
            isGeminiVerified={geminiStatus === 'verified'}
            isOpenAIVerified={openAIStatus === 'verified'}
            hasPendingOrder={pendingOrder?.state === 'AWAITING_CONFIRMATION'}
            disabled={isLoading}
          />

          <InventorySelector
            currentMode={inventoryMode}
            onSelectMode={executeInventorySwitch}
            onRequestSwitchWithPendingOrder={handleRequestInventorySwitch}
            hasPendingOrder={pendingOrder?.state === 'AWAITING_CONFIRMATION'}
            disabled={isLoading}
          />
        </div>

        {/* Banner de Estado de Compra Pendiente */}
        <PendingOrderBanner order={pendingOrder} />

        {/* Banner Informativo si no hay Clave */}
        {!isKeyConfigured && (
          <div className="my-2 p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200/90 rounded-2xl text-blue-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base shrink-0">🔑</span>
              <span>
                Para chatear con <strong>{provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}</strong>,
                debes ingresar tu clave en <strong>Claves API</strong> arriba a la derecha.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-xs shadow-xs transition shrink-0"
            >
              Configurar Clave
            </button>
          </div>
        )}

        {/* Mensaje de Error si ocurre */}
        {errorMessage && (
          <div className="my-2 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-center justify-between shadow-2xs animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="text-base">⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 font-bold p-1 rounded-lg transition"
            >
              ✕
            </button>
          </div>
        )}

        {/* Área de Conversación */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 min-h-[380px] max-h-[58vh] rounded-2xl bg-white border border-slate-200/90 mb-3 shadow-xs">
          {messages.map(msg => (
            <ChatMessageItem key={msg.id} message={msg} />
          ))}

          {/* Indicador de carga activo */}
          {isLoading && (
            <div className="flex justify-start my-2.5 animate-fadeIn">
              <div className="flex items-start gap-2.5 max-w-[80%]">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-[13px] shrink-0 shadow-xs">
                  📦
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs px-4 py-3 shadow-2xs text-xs text-slate-600 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping shrink-0" />
                  <span>
                    <strong>{provider === 'gemini' ? 'Gemini' : 'OpenAI'}</strong> está consultando herramientas y procesando...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Área de Entrada de Mensaje */}
        <div className="bg-white border border-slate-300/90 rounded-2xl p-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || !isKeyConfigured}
              placeholder={
                !isKeyConfigured
                  ? `Ingresa tu API Key de ${provider.toUpperCase()} para habilitar el chat...`
                  : 'Escribe tu solicitud logística (ej. "Necesitamos equipar a 10 nuevos empleados con laptops")...'
              }
              className="w-full text-xs sm:text-sm bg-transparent border-0 focus:outline-none resize-none placeholder-slate-400 disabled:opacity-50 leading-relaxed"
            />

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-400">
              <div className="text-[11px] hidden sm:block">
                <span>Presiona <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-600 border border-slate-200">Enter</kbd> para enviar, <kbd className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-600 border border-slate-200">Shift + Enter</kbd> para salto de línea.</span>
              </div>

              <button
                type="submit"
                disabled={isLoading || !isKeyConfigured || !inputText.trim()}
                className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
