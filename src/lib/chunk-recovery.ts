// Recupera a tela quando o navegador está com uma versão antiga do app em cache
// e tenta carregar um arquivo que já não existe mais no servidor (após publicar).
// Nesses casos o erro chega como "undefined" / "Failed to fetch dynamically
// imported module" e a tela fica em branco. Aqui detectamos e recarregamos uma
// única vez, buscando a versão nova.

const RELOAD_FLAG = "injoy:chunk-reload";

const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "loading chunk",
  "loading css chunk",
  "unexpected token '<'",
];

function messageOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "object") {
    const maybe = value as { message?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
  }
  return String(value);
}

export function isStaleChunkError(value: unknown): boolean {
  const msg = messageOf(value).toLowerCase();
  if (!msg) return false;
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage indisponível — segue com o reload de qualquer forma.
  }
  window.location.reload();
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/** Instala os listeners globais. Retorna a função de limpeza. */
export function installChunkRecovery(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    if (isStaleChunkError(event.error) || isStaleChunkError(event.message)) {
      event.preventDefault();
      reloadOnce();
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    if (isStaleChunkError(event.reason)) {
      event.preventDefault();
      reloadOnce();
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
