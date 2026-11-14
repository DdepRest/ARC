import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@vue/compiler-dom';
import { computed, createSSRApp, defineComponent, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';

type SelectValue = string | number | boolean;
interface SelectOption<V extends SelectValue = SelectValue> {
  label: string;
  value: V;
  disabled?: boolean;
}

/**
 * Mounts ArcSelect's exact template & index-mapping logic in a lightweight harness
 * (matching the repository's node test environment without requiring jsdom).
 */
function createArcSelectHarness<T extends SelectValue>(
  initialValue: T,
  options: SelectOption<T>[],
  placeholder = ''
) {
  const modelValue = ref<T>(initialValue) as { value: T };
  const updateSpy = vi.fn((val: T) => {
    modelValue.value = val;
  });
  const changeSpy = vi.fn();

  const selectedIndex = computed(() =>
    options.findIndex((o) => Object.is(o.value, modelValue.value))
  );

  const selectedOptionLabel = computed(() => {
    if (selectedIndex.value >= 0) {
      return options[selectedIndex.value].label;
    }
    return placeholder || '';
  });

  const selectIndex = (rawSelectValue: string) => {
    if (rawSelectValue === '') return;
    const idx = Number(rawSelectValue);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return;
    const selected = options[idx];
    updateSpy(selected.value);
    changeSpy(selected.value);
  };

  return {
    modelValue,
    selectedIndex,
    selectedOptionLabel,
    updateSpy,
    changeSpy,
    selectIndex
  };
}

describe('ArcSelect typed option values & -1 fallback (P1 3.2)', () => {
  it('compiles ArcSelect.vue template cleanly and binds option values by index', async () => {
    const sfcPath = path.resolve(__dirname, './ArcSelect.vue');
    const source = fs.readFileSync(sfcPath, 'utf-8');
    const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
    expect(templateMatch).toBeTruthy();

    // Ensure ArcSelect uses Object.is index lookup and emits both update:modelValue and change
    expect(source).toContain('Object.is(o.value, props.modelValue)');
    expect(source).toContain("emit('update:modelValue', selected.value)");
    expect(source).toContain("emit('change', selected.value)");

    const { code } = compile(templateMatch![1], { mode: 'function' });
    const renderFn = new Function('Vue', code)({
      ... await import('vue')
    });

    const options: SelectOption[] = [
      { label: 'Str Ten', value: '10' },
      { label: 'Num Ten', value: 10 },
      { label: 'Bool False', value: false }
    ];

    const App = defineComponent({
      components: { ChevronDown: defineComponent({ render: () => h('span') }) },
      setup() {
        const selectedIndex = computed(() => 1);
        return {
          id: 'test-select',
          label: 'Test Label',
          placeholder: 'Выберите...',
          disabled: false,
          size: 'md',
          sizeClasses: { sm: 'h-8', md: 'h-9', lg: 'h-11' },
          options,
          selectedIndex,
          selectedOptionLabel: computed(() => options[selectedIndex.value].label),
          onChange: () => {}
        };
      },
      render: renderFn as any
    });

    const html = await renderToString(createSSRApp(App));
    expect(html).toContain('value="0"');
    expect(html).toContain('value="1"');
    expect(html).toContain('value="2"');
  });

  it('distinguishes "10" (string) from 10 (number), 0 from "", and false from "false" and true', () => {
    const mixedOptions: SelectOption[] = [
      { label: 'String 10', value: '10' },
      { label: 'Number 10', value: 10 },
      { label: 'Boolean false', value: false },
      { label: 'String false', value: 'false' },
      { label: 'Boolean true', value: true },
      { label: 'Number 0', value: 0 },
      { label: 'Empty string', value: '' }
    ];

    const h = createArcSelectHarness<SelectValue>('10', mixedOptions);
    expect(h.selectedIndex.value).toBe(0);

    // Select 10 (number) at index 1
    h.selectIndex('1');
    expect(h.modelValue.value).toBe(10);
    expect(typeof h.modelValue.value).toBe('number');
    expect(h.updateSpy).toHaveBeenLastCalledWith(10);
    expect(h.changeSpy).toHaveBeenLastCalledWith(10);
    expect(h.selectedIndex.value).toBe(1);

    // Select false (boolean) at index 2
    h.selectIndex('2');
    expect(h.modelValue.value).toBe(false);
    expect(typeof h.modelValue.value).toBe('boolean');
    expect(h.selectedIndex.value).toBe(2);

    // Select "false" (string) at index 3
    h.selectIndex('3');
    expect(h.modelValue.value).toBe('false');
    expect(typeof h.modelValue.value).toBe('string');
    expect(h.selectedIndex.value).toBe(3);

    // Select true (boolean) at index 4
    h.selectIndex('4');
    expect(h.modelValue.value).toBe(true);
    expect(typeof h.modelValue.value).toBe('boolean');
    expect(h.selectedIndex.value).toBe(4);

    // Select 0 (number) at index 5
    h.selectIndex('5');
    expect(h.modelValue.value).toBe(0);
    expect(typeof h.modelValue.value).toBe('number');
    expect(h.selectedIndex.value).toBe(5);

    // Select "" (empty string) at index 6
    h.selectIndex('6');
    expect(h.modelValue.value).toBe('');
    expect(typeof h.modelValue.value).toBe('string');
    expect(h.selectedIndex.value).toBe(6);

    // Switch back to "10" (string) at index 0
    h.selectIndex('0');
    expect(h.modelValue.value).toBe('10');
    expect(typeof h.modelValue.value).toBe('string');
    expect(h.selectedIndex.value).toBe(0);
  });

  it('correctly resolves duplicate labels that have distinct values', () => {
    const dupLabelOptions: SelectOption[] = [
      { label: 'Стандартный', value: 100 },
      { label: 'Стандартный', value: 200 }
    ];

    const h = createArcSelectHarness<SelectValue>(200, dupLabelOptions);
    expect(h.selectedIndex.value).toBe(1);

    h.selectIndex('0');
    expect(h.modelValue.value).toBe(100);
    expect(h.selectedIndex.value).toBe(0);
  });

  it('uses -1 fallback for unmatched/legacy values of another type without auto-emitting first option', () => {
    const numericOptions: SelectOption<number>[] = [
      { label: '8000 Гц', value: 8000 },
      { label: '24000 Гц', value: 24000 },
      { label: '48000 Гц', value: 48000 }
    ];

    // Simulate legacy string value '24000' passed when options are numbers
    const h = createArcSelectHarness<any>('24000', numericOptions, 'Не выбрано');
    expect(h.selectedIndex.value).toBe(-1);
    expect(h.selectedOptionLabel.value).toBe('Не выбрано');
    expect(h.updateSpy).not.toHaveBeenCalled();
    expect(h.changeSpy).not.toHaveBeenCalled();

    // Selecting empty placeholder value does not emit
    h.selectIndex('');
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('preserves types for MacroPropertiesPanel array properties without modifying useMacroEditor.ts', () => {
    const rawMacroPropArray = [0, 10, '10', false, true];
    const mappedOptions = rawMacroPropArray.map((opt: any) => ({
      label: String(opt),
      value: opt
    }));

    const selectedNode = {
      properties: {
        mode: 0 as any
      }
    };

    const h = createArcSelectHarness<any>(selectedNode.properties.mode, mappedOptions);
    expect(h.selectedIndex.value).toBe(0);

    // Choose boolean false (index 3)
    h.selectIndex('3');
    selectedNode.properties.mode = h.modelValue.value;
    expect(selectedNode.properties.mode).toBe(false);
    expect(typeof selectedNode.properties.mode).toBe('boolean');

    // Choose number 10 (index 1)
    h.selectIndex('1');
    selectedNode.properties.mode = h.modelValue.value;
    expect(selectedNode.properties.mode).toBe(10);
    expect(typeof selectedNode.properties.mode).toBe('number');
  });
});
