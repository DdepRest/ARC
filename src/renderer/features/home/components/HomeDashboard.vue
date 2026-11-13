<template>
  <div class="w-full h-full p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
    <!-- Greeting & Context -->
    <div class="flex flex-col gap-1">
      <h1 class="text-h1">A.R.C. Environment</h1>
      <p class="text-body max-w-xl">All systems operational. The current working context is stable.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
      <!-- Main Column: Tasks & Context -->
      <div class="lg:col-span-2 flex flex-col gap-6">
        
        <!-- Next Action -->
        <div class="glass-panel p-5 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
            <span class="text-label text-[var(--color-accent)]">Next Action</span>
          </div>
          <h2 class="text-h2">Review pending memory optimizations</h2>
          <p class="text-body">System has identified 3 memory fragments that require consolidation to improve retrieval speed.</p>
          <div class="flex items-center gap-3 mt-2">
            <button class="glass-btn px-4 py-2 text-sm">Execute</button>
            <button class="text-meta hover:text-white transition-colors">Dismiss</button>
          </div>
        </div>

        <!-- Active Task -->
        <div class="glass-panel p-5 flex flex-col gap-4 flex-1">
          <div class="flex items-center justify-between">
            <span class="text-label">Active Task</span>
            <span class="text-meta">ID: TSK-094</span>
          </div>
          <div class="flex flex-col gap-2">
            <h3 class="text-title">UX/UI Refinement</h3>
            <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
              <div class="h-full bg-[var(--color-accent)] w-[72%]"></div>
            </div>
            <div class="flex justify-between items-center text-meta mt-1">
              <span>Progress</span>
              <span>72%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: System State & Secondary -->
      <div class="flex flex-col gap-6">
        
        <!-- System State -->
        <div class="glass-panel p-5 flex flex-col gap-4">
          <span class="text-label">System State</span>
          
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-body text-white/70">Neural Engine</span>
              <span class="text-technical text-[var(--color-success)]">ONLINE</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-body text-white/70">Memory Core</span>
              <span class="text-technical text-[var(--color-success)]">STABLE</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-body text-white/70">Local AI</span>
              <span class="text-technical text-[var(--color-warning)]">STANDBY</span>
            </div>
          </div>
        </div>

        <!-- Secondary Modules -->
        <div class="glass-panel p-5 flex flex-col gap-4 flex-1">
          <span class="text-label">Telemetry</span>
          
          <div class="flex-1 flex items-center justify-center border border-white/5 rounded-lg bg-black/20">
             <span class="text-meta">No active telemetry stream</span>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
