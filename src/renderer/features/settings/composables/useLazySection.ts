import { ref, onMounted, onUnmounted } from 'vue';

export function useLazySection(rootElementRef: any) {
  const visibleSections = ref<Record<string, boolean>>({});
  
  // By default, make everything visible if no observer is supported
  let observer: IntersectionObserver | null = null;
  
  onMounted(() => {
    if (!window.IntersectionObserver) {
      return;
    }
    
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (id) {
            visibleSections.value[id] = true;
            // Once it becomes visible, we can optionally stop observing it
            // observer?.unobserve(entry.target);
          }
        }
      });
    }, {
      root: rootElementRef.value, // The scrolling container
      rootMargin: '200px', // Load 200px before scrolling into view
      threshold: 0
    });

    if (rootElementRef.value) {
      const sections = rootElementRef.value.querySelectorAll('section');
      sections.forEach((sec: Element) => {
        observer?.observe(sec);
      });
    }
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return { visibleSections };
}
