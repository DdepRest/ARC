/**
 * Pure helper to mark first-run wizard as completed in the settings store.
 * Persistence is handled reactively by Pinia persistencePlugin.
 */
export function completeFirstRunWizard(store: {
  firstRunCompleted: boolean;
  onboardingVersion?: number;
}): void {
  store.firstRunCompleted = true;
  if (store.onboardingVersion !== undefined) {
    store.onboardingVersion = 1;
  }
}
