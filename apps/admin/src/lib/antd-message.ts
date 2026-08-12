import { message as fallback } from "antd";
import type { MessageInstance } from "antd/es/message/interface";

let api: MessageInstance | null = null;

/** Bind App.useApp().message so toasts render inside AntApp context. */
export function attachMessageApi(instance: MessageInstance) {
  api = instance;
}

function getApi(): MessageInstance {
  return api ?? fallback;
}

/** Drop-in for `import { message } from "antd"` — use this instead. */
export const message: MessageInstance = new Proxy({} as MessageInstance, {
  get(_target, prop, receiver) {
    const inst = getApi();
    const value = Reflect.get(inst, prop, receiver);
    return typeof value === "function" ? value.bind(inst) : value;
  },
});
