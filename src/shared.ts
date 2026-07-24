import type { Terminal } from "@xterm/xterm";

// instâncias vivas fora do React: o botão "enviar" de um nó lê a seleção do terminal
// da origem; notas guardam o texto aqui pra origem note→agente.
export const terminals = new Map<string, Terminal>();
export const noteText = new Map<string, string>();
