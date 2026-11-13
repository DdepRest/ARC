import { useSettingsStore } from '../features/settings/stores/settings.store';
import ru from '../locales/ru.json';
import en from '../locales/en.json';

const dictionaries: Record<string, any> = {
  RU: ru,
  EN: en
};

export const useLocale = () => {
  const settingsStore = useSettingsStore();

  const t = (key: string, fallback?: string): string => {
    const lang = settingsStore.language || 'RU';
    const dict = dictionaries[lang];
    if (dict && dict[key]) {
      return dict[key];
    }
    return fallback || key;
  };

  return { t };
};
