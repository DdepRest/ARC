import { describe, it, expect, vi } from 'vitest';
import { ProductivityClassifier } from './productivity-classifier';

const mockDecomposeDraft = vi.fn().mockResolvedValue({ objectiveId: 'obj_1', outcomes: [], tasks: [] });
const mockSetPendingDraft = vi.fn();
const mockDecomposeObjective = vi.fn();

vi.mock('../objective/ObjectiveEngine', () => ({
  objectiveEngine: {
    createObjective: vi.fn().mockReturnValue({ id: 'obj_1' }),
    decomposeObjectiveDraft: (...args: any[]) => mockDecomposeDraft(...args),
    setPendingDraft: (...args: any[]) => mockSetPendingDraft(...args),
    decomposeObjective: (...args: any[]) => mockDecomposeObjective(...args)
  }
}));

describe('ProductivityClassifier', () => {
  it('should create a task', async () => {
    const result = await ProductivityClassifier.classify('добавь задачу купить хлеб');
    expect(result).toBe('Задача «купить хлеб» принята и добавлена в оперативный список.');
  });

  it('should complete a task', async () => {
    const result = await ProductivityClassifier.classify('отметь задачу купить хлеб');
    expect(result).toBe('Задача «купить хлеб» отмечена как выполненная.');
  });

  it('should create an objective in DRAFT-only mode without auto-approve', async () => {
    const result = await ProductivityClassifier.classify('создай цель стать программистом');
    expect(result).toContain('Цель "стать программистом" создана. Черновик декомпозиции подготовлен для утверждения оператором.');
    expect(mockDecomposeDraft).toHaveBeenCalledWith('obj_1', expect.any(String));
    // Verify auto-approve was NOT called
    expect(mockDecomposeObjective).not.toHaveBeenCalled();
  });
});
