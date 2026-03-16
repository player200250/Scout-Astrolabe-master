// src/electron-api.d.ts
export interface IElectronAPI {
  saveDocument: (document: any) => void;
  loadDocument: () => Promise<any>;
  openDocument: () => Promise<string | null>;
  openLink: (url: string) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    tldrawEditor: import('tldraw').Editor;
  }
}