import { findTaskOrSubtask } from './src/renderer/features/commands/commands.utils';

// T6 & T7 Mock
console.log("--- TEST T6: Voice command ---");
console.log("Mocking 'открой настройки'. Expected: matches Settings skill / command.");

console.log("--- TEST T7: Fuzzy match ---");
const mockTasks = [
  { id: '1', text: 'покормить кота', completed: false },
  { id: '2', text: 'купить молоко', completed: false }
];
const res = findTaskOrSubtask('покармить ката', mockTasks as any);
console.log("Fuzzy match 'покармить ката' ->", res ? res.matchedName : "Not found", "(similarity:", res ? res.similarity : 0, ")");
