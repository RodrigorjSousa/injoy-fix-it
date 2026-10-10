// Carrega uma biblioteca que fica em /public (sem passar pelo bundle), uma vez só.
const carregando = new Map<string, Promise<void>>();

export function carregarScript(src: string): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("Sem navegador."));
  let p = carregando.get(src);
  if (!p) {
    p = new Promise<void>((ok, falha) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        carregando.delete(src);
        s.remove();
        falha(new Error(`Não foi possível carregar ${src}`));
      };
      document.head.appendChild(s);
    });
    carregando.set(src, p);
  }
  return p;
}
