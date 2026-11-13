import { onMounted, onUnmounted } from 'vue';

export function useKeyboard(handlers: { [key: string]: (event: KeyboardEvent) => void }) {
  const onKeyDown = (event: KeyboardEvent) => {
    // Basic key detection based on 'code' or 'key'
    if (handlers[event.code]) {
      handlers[event.code](event);
    } else if (handlers[event.key]) {
      handlers[event.key](event);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const upHandlerName = `${event.code}:up`;
    if (handlers[upHandlerName]) {
      handlers[upHandlerName](event);
    } else if (handlers[`${event.key}:up`]) {
      handlers[`${event.key}:up`](event);
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });
}
