// Tipos mínimos da @edusites/icons (a lib é JS puro, sem .d.ts).
declare module "@edusites/icons/core" {
  export type IconeOpcoes = { nome: string; cor?: string; tamanho?: number; className?: string };
  export function svgIcone(opcoes: IconeOpcoes): string | null;
  export function svgIconeAsync(opcoes: IconeOpcoes): Promise<string | null>;
  export function listarIcones(): string[];
  export function temIcone(nome: string): boolean;
  export function listarCategorias(): string[];
  export function categoriaDoIcone(nome: string): string;
  export function descricaoDoIcone(nome: string): string | null;
}
