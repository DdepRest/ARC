import { ipcMain } from 'electron';
import { objectiveEngine } from '../services/objective/ObjectiveEngine';
import { decisionEngine } from '../services/decision/DecisionEngine';
import { objectiveExecutionLoop } from '../services/objective/ObjectiveExecutionLoop';

export function registerObjectiveIpc() {
  ipcMain.handle('objective:getEntropyState', () => {
    return objectiveExecutionLoop.getEntropyState();
  });

  ipcMain.handle('objective:setAutoApprove', (_event, { autoApprove }) => {
    objectiveExecutionLoop.setAutoApprove(autoApprove);
    return true;
  });

  ipcMain.handle('objective:getAll', () => {
    return objectiveEngine.getAllObjectives();
  });

  ipcMain.handle('objective:create', (_event, { title, description, owner, priority, deadline }) => {
    return objectiveEngine.createObjective(title, description, owner, priority, deadline);
  });

  ipcMain.handle('objective:addOutcome', (_event, { objectiveId, title, metricName, metricSource, baseline, target }) => {
    return objectiveEngine.addOutcome(objectiveId, title, metricName, metricSource, baseline, target);
  });

  ipcMain.handle('objective:getGraph', () => {
    return objectiveEngine.getObjectiveGraph();
  });

  ipcMain.handle('objective:decompose', async (_event, { objectiveId, taskDescriptionText }) => {
    const draft = await objectiveEngine.decomposeObjectiveDraft(objectiveId, taskDescriptionText);
    objectiveEngine.setPendingDraft(draft);
    return { success: true, draft };
  });

  ipcMain.handle('objective:get-pending-draft', (_event, { objectiveId }) => {
    return { success: true, draft: objectiveEngine.getPendingDraft(objectiveId) || null };
  });

  ipcMain.handle('objective:decompose-draft', async (_event, { objectiveId, taskDescriptionText }) => {
    return await objectiveEngine.decomposeObjectiveDraft(objectiveId, taskDescriptionText);
  });

  ipcMain.handle('objective:approve-draft', async (_event, { objectiveId, draft }) => {
    const targetDraft = draft || objectiveEngine.getPendingDraft(objectiveId);
    if (!targetDraft) {
      throw new Error(`No pending decomposition draft found for objective ${objectiveId}`);
    }
    const result = await objectiveEngine.approveDecompositionDraft(objectiveId, targetDraft);
    return { success: true, ...result };
  });

  ipcMain.handle('objective:generateRouteMap', (_event, objectiveId) => {
    return objectiveEngine.generateRouteMap(objectiveId);
  });

  ipcMain.handle('objective:approveRoute', (_event, { objectiveId, changes }) => {
    return objectiveEngine.approveRouteMap(objectiveId, changes);
  });

  ipcMain.handle('objective:modifyRoute', (_event, { objectiveId, changes }) => {
    return objectiveEngine.modifyRouteMap(objectiveId, changes);
  });

  ipcMain.handle('objective:declineRoute', (_event, { objectiveId }) => {
    return objectiveEngine.declineRouteMap(objectiveId);
  });

  ipcMain.handle('objective:rollback', async (_event, { objectiveId }) => {
    const { BrowserWindow } = require('electron') as typeof import('electron');
    const wins = BrowserWindow.getAllWindows();
    return objectiveEngine.rollbackObjective(objectiveId, (current, total, message) => {
      wins.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('objective:rollback-progress', { current, total, message });
        }
      });
    });
  });

  ipcMain.handle('objective:saveLayout', (_event, { objectiveId, layout }) => {
    objectiveEngine.saveRouteLayout(objectiveId, layout);
    return true;
  });

  ipcMain.handle('objective:updateOutcomeValue', (_event, { outcomeId, currentValue }) => {
    objectiveEngine.updateOutcomeValue(outcomeId, currentValue);
    return true;
  });

  ipcMain.handle('objective:addDependency', (_event, { parentId, childId, weight }) => {
    objectiveEngine.addDependency(parentId, childId, weight);
    return true;
  });

  ipcMain.handle('objective:evaluateHealth', (_event, { objectiveId }) => {
    return objectiveEngine.evaluateHealth(objectiveId);
  });

  // Decision links
  ipcMain.handle('decision:getAll', () => {
    return decisionEngine.getAllDecisions();
  });

  ipcMain.handle('decision:create', (_event, { objectiveId, title, rationale }) => {
    return decisionEngine.createDecision(objectiveId, title, rationale);
  });

  ipcMain.handle('decision:updateStatus', (_event, { id, status }) => {
    decisionEngine.updateDecisionStatus(id, status);
    return true;
  });

  ipcMain.handle('decision:getArtifacts', () => {
    return decisionEngine.getArtifacts();
  });

  ipcMain.handle('decision:getPredictionNodes', (_event, limit?: number) => {
    return decisionEngine.getPredictionNodes(limit || 20);
  });

  ipcMain.handle('decision:getCoherenceHistory', (_event, limit) => {
    return decisionEngine.getCoherenceHistory(limit || 50);
  });
}
