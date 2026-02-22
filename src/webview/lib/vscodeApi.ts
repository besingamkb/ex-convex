import type { FromWebviewMessage, ToWebviewMessage } from "../../shared/messages";

interface VsCodeApi {
  postMessage(message: FromWebviewMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let _api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!_api) {
    _api = acquireVsCodeApi();
  }
  return _api;
}

export function postMessage(message: FromWebviewMessage): void {
  getVsCodeApi().postMessage(message);
}

export function onMessage(handler: (msg: ToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<ToWebviewMessage>) => {
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
