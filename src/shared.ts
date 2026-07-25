import type { Terminal } from "@xterm/xterm";

// instâncias vivas fora do React: o botão "enviar" de um nó lê a seleção do terminal
// da origem; notas guardam o texto aqui pra origem note→agente.
export const terminals = new Map<string, Terminal>();
export const noteText = new Map<string, string>();

// nome de exibição de um workspace: o nome salvo, ou o basename da pasta
export const folderName = (ws: { name?: string; repoPath: string }) =>
  ws.name?.trim() || ws.repoPath.replace(/[\/\\]+$/, "").split(/[\/\\]/).pop() || ws.repoPath;
