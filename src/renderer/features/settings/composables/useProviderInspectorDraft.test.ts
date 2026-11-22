import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import type { AIProvider } from '../../../stores/aiConfig';
import {
  useProviderInspectorDraft,
  getProviderListStatus
} from './useProviderInspectorDraft';

function makeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'cloud',
    endpoint: 'https://openrouter.ai/api/v1',
    apiKey: '••••••••••••••••',
    noAuthHeader: false,
    model: 'openai/gpt-4o-mini',
    selectedModels: ['openai/gpt-4o-mini'],
    routingStrategy: 'smart_route',
    isExclusive: false,
    priority: 1,
    temperature: 0.7,
    maxTokens: 2048,
    enabled: true,
    ...overrides
  };
}

describe('useProviderInspectorDraft (TZ §12.5 Master–Detail draft/save/switch)', () => {
  it('tracks clean -> dirty -> saving -> saved lifecycle and preserves masked API key', async () => {
    const p1 = makeProvider();
    const providers = ref<AIProvider[]>([p1]);
    const saveProvider = vi.fn(async (payload: AIProvider) => {
      providers.value = providers.value.map((p) => (p.id === payload.id ? { ...payload } : p));
      return { success: true };
    });

    const inspector = useProviderInspectorDraft({ providers, saveProvider });
    expect(inspector.saveLifecycleState.value).toBe('clean');
    expect(inspector.isDirty.value).toBe(false);

    inspector.draftProvider.value!.temperature = 0.35;
    await nextTick();
    expect(inspector.isDirty.value).toBe(true);
    expect(inspector.saveLifecycleState.value).toBe('dirty');

    const res = await inspector.saveDraft();
    expect(res.success).toBe(true);
    expect(saveProvider).toHaveBeenCalledTimes(1);
    expect(saveProvider.mock.calls[0][0].apiKey).toBe('••••••••••••••••');
    expect(saveProvider.mock.calls[0][0].temperature).toBe(0.35);
    expect(inspector.isDirty.value).toBe(false);
    expect(inspector.saveLifecycleState.value).toBe('saved');
  });

  it('guards dirty edits on provider switch: cancel keeps draft, discard switches, confirmSaveAndSwitch saves then switches', async () => {
    const p1 = makeProvider({ id: 'p1', name: 'Provider One' });
    const p2 = makeProvider({ id: 'p2', name: 'Provider Two', endpoint: 'https://api.example.com/v1' });
    const providers = ref<AIProvider[]>([p1, p2]);
    const onSelectConfirmed = vi.fn();
    const saveProvider = vi.fn(async (payload: AIProvider) => {
      providers.value = providers.value.map((p) => (p.id === payload.id ? { ...payload } : p));
      return { success: true };
    });

    const inspector = useProviderInspectorDraft({ providers, saveProvider }, onSelectConfirmed);
    inspector.draftProvider.value!.name = 'Provider One Edited';
    await nextTick();

    // Attempt switch while dirty -> blocked with pendingSwitchProviderId
    expect(inspector.requestSelectProvider(p2)).toBe(false);
    expect(inspector.pendingSwitchProviderId.value).toBe('p2');
    expect(inspector.selectedProviderId.value).toBe('p1');

    // Cancel switch keeps edited draft intact
    inspector.cancelSwitch();
    expect(inspector.pendingSwitchProviderId.value).toBeNull();
    expect(inspector.draftProvider.value!.name).toBe('Provider One Edited');

    // Save and switch persists p1 then loads p2
    expect(inspector.requestSelectProvider(p2)).toBe(false);
    const switched = await inspector.confirmSaveAndSwitch();
    expect(switched).toBe(true);
    expect(saveProvider).toHaveBeenCalledTimes(1);
    expect(providers.value[0].name).toBe('Provider One Edited');
    expect(inspector.selectedProviderId.value).toBe('p2');
    expect(onSelectConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));

    // Dirty edit on p2 + discardAndSwitch drops changes and switches back to p1
    inspector.draftProvider.value!.maxTokens = 4096;
    await nextTick();
    expect(inspector.requestSelectProvider(providers.value[0])).toBe(false);
    expect(inspector.discardAndSwitch()).toBe(true);
    expect(inspector.selectedProviderId.value).toBe('p1');
    expect(providers.value[1].maxTokens).toBe(2048);
  });

  it('surfaces validation and IPC save errors without losing edits or switching providers', async () => {
    const p1 = makeProvider({ id: 'p1' });
    const p2 = makeProvider({ id: 'p2', name: 'Second' });
    const providers = ref<AIProvider[]>([p1, p2]);
    const saveProvider = vi.fn(async () => ({ success: false, error: 'Disk full' }));

    const inspector = useProviderInspectorDraft({ providers, saveProvider });

    // Invalid endpoint rejected client-side before calling saveProvider
    inspector.draftProvider.value!.endpoint = 'ftp://invalid-endpoint';
    await nextTick();
    const invalidRes = await inspector.saveDraft();
    expect(invalidRes.success).toBe(false);
    expect(saveProvider).not.toHaveBeenCalled();
    expect(inspector.saveLifecycleState.value).toBe('error');

    // Valid endpoint, IPC fails -> keeps dirty draft and aborts confirmSaveAndSwitch
    inspector.draftProvider.value!.endpoint = 'https://openrouter.ai/api/v1';
    inspector.draftProvider.value!.name = 'Unsaved Name';
    await nextTick();
    inspector.requestSelectProvider(p2);
    const switchResult = await inspector.confirmSaveAndSwitch();
    expect(switchResult).toBe(false);
    expect(saveProvider).toHaveBeenCalledTimes(1);
    expect(inspector.selectedProviderId.value).toBe('p1');
    expect(inspector.saveError.value).toBe('Disk full');
    expect(inspector.draftProvider.value!.name).toBe('Unsaved Name');
  });

  it('excludes live enabled toggle from dirty state and classifies all 7 provider statuses', async () => {
    const p1 = makeProvider({ id: 'p1', enabled: true });
    const providers = ref<AIProvider[]>([p1]);
    const saveProvider = vi.fn(async (payload: AIProvider) => ({ success: true, payload }));

    const inspector = useProviderInspectorDraft({ providers, saveProvider });
    providers.value = [{ ...p1, enabled: false }];
    await nextTick();
    expect(inspector.isDirty.value).toBe(false);

    // Entering a real custom API key clears noAuthHeader on save
    inspector.draftProvider.value!.noAuthHeader = true;
    inspector.draftProvider.value!.apiKey = 'sk-or-v1-live-test-key';
    await inspector.saveDraft();
    expect(saveProvider.mock.calls[0][0].enabled).toBe(false);
    expect(saveProvider.mock.calls[0][0].noAuthHeader).toBe(false);

    // 7-state provider status classification
    expect(getProviderListStatus(p1, null, true).state).toBe('quarantined');
    expect(getProviderListStatus(makeProvider({ enabled: false }), null, false).state).toBe('disabled');
    expect(getProviderListStatus(p1, { status: 'loading', configFingerprint: 'fp-1' }, false).state).toBe('testing');
    expect(getProviderListStatus(p1, { status: 'error', message: '401', configFingerprint: 'fp-1' }, false).state).toBe('test_error');
    expect(getProviderListStatus(makeProvider({ apiKey: '' }), null, false).state).toBe('unconfigured');
    expect(getProviderListStatus(p1, { status: 'success', configFingerprint: 'fp-1' }, false).state).toBe('verified');
    expect(getProviderListStatus(p1, null, false).state).toBe('configured_untested');
  });
});
