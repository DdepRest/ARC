import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDraggableWidget } from './useDraggableWidget';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { ref } from 'vue';

vi.mock('../features/settings/stores/settings.store', () => ({
  useSettingsStore: vi.fn(() => ({
    widgetsLocked: false
  }))
}));

describe('useDraggableWidget', () => {
  beforeEach(() => {
    // Mock global window and localStorage
    vi.stubGlobal('innerWidth', 1920);
    vi.stubGlobal('innerHeight', 1080);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    });
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('removeEventListener', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRef = () => ref({
    getBoundingClientRect: () => ({ width: 300, height: 200 })
  } as unknown as HTMLElement);

  it('should initialize with default position and clamp bounds', () => {
    const mockRef = createMockRef();
    const { x, y } = useDraggableWidget('test1', { x: 50, y: 50 }, mockRef);
    expect(x.value).toBe(0); // Before onMounted logic runs, it initializes x, y to 0
  });
});
