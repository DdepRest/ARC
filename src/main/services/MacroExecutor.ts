import { safeEval } from '../../shared/utils/safeExpressionParser';
import { maskSecrets } from '../../shared/utils/log-sanitizer';
import { shell, Notification } from 'electron';
import { exec, spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fsp from 'fs/promises';
import { SandboxedFS, PolicyEngine } from './sandbox';
import { approvalService } from './approval.service';
import { executeShellCommand } from './commands/shell-executor';
import { ObjectiveEngine } from './objective/ObjectiveEngine';
import { DecisionEngine } from './decision/DecisionEngine';
import { ttsService } from './tts.service';
import { computeTtsHash } from './tts-text.util';

interface LiteGraphLink {
    id: number;
    origin_id: number;
    origin_slot: number;
    target_id: number;
    target_slot: number;
    type: any;
}

export class MacroExecutor {
    private isRunning = false;
    private currentMacro: any = null;
    private nodeStates = new Map<string, any>();

    async execute(macroData: any) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.currentMacro = macroData;
        console.log('Starting macro execution:', macroData?.name);

        try {
            const objectiveId = macroData.objectiveId || macroData.objective_id || macroData.context?.objectiveId;
            let rootDir = path.join(os.homedir(), 'ARC_Workspace', 'global');

            let cachedDecisionId: string | undefined = undefined;

            if (objectiveId) {
                const objective = ObjectiveEngine.getInstance().getObjective(objectiveId);
                if (objective) {
                    rootDir = (objective as any).sandbox_root || path.join(os.homedir(), 'ARC_Workspace', objectiveId);
                } else {
                    rootDir = path.join(os.homedir(), 'ARC_Workspace', objectiveId);
                }

                try {
                    const decisions = DecisionEngine.getInstance().getDecisionsByObjective(objectiveId);
                    const activeDecision = decisions.find(
                        d => d.status === 'APPROVED' || d.status === 'EXECUTING' || d.status === 'PENDING'
                    );
                    if (activeDecision) {
                        cachedDecisionId = activeDecision.id;
                    } else {
                        const newDecision = DecisionEngine.getInstance().createDecision(
                            objectiveId,
                            'Sandbox Autonomous FS Execution',
                            `Auto-generated sandbox logger for objective ${objectiveId}`,
                            'EXECUTIVE'
                        );
                        DecisionEngine.getInstance().updateDecisionStatus(newDecision.id, 'EXECUTING');
                        cachedDecisionId = newDecision.id;
                    }
                } catch (e) {
                    console.warn('[MacroExecutor] Failed to pre-resolve decision for macro:', e);
                }
            }

            await fsp.mkdir(rootDir, { recursive: true });
            const sandbox = new SandboxedFS(rootDir, objectiveId, cachedDecisionId);

            const nodes = macroData.nodes || [];
            const rawLinks = macroData.links || [];

            // 1. Map Node ID -> Node Object
            const nodesMap = new Map<number, any>();
            for (const n of nodes) {
                nodesMap.set(n.id, n);
            }

            // 2. Map Link ID -> Link Object
            const linksMap = new Map<number, LiteGraphLink>();
            for (const linkArr of rawLinks) {
                if (Array.isArray(linkArr) && linkArr.length >= 5) {
                    const [linkId, originId, originSlot, targetId, targetSlot, type] = linkArr;
                    linksMap.set(linkId, {
                        id: linkId,
                        origin_id: originId,
                        origin_slot: originSlot,
                        target_id: targetId,
                        target_slot: targetSlot,
                        type: type
                    });
                }
            }

            // 3. Find start nodes
            // Triggers are active starts. If there are triggers, only execute from triggers.
            const triggers = nodes.filter((n: any) => n.type && n.type.startsWith('triggers/'));
            let startNodes = triggers;

            if (startNodes.length === 0) {
                // Fallback: nodes with no incoming connects (parents)
                const hasIncoming = new Set<number>();
                for (const link of linksMap.values()) {
                    hasIncoming.add(link.target_id);
                }
                startNodes = nodes.filter((n: any) => !hasIncoming.has(n.id));
            }

            if (startNodes.length === 0) {
                // Absolute fallback: all nodes
                startNodes = nodes;
            }

            // Trace and execute recursively with step cap limit to prevent loops
            let stepCount = 0;
            const maxSteps = 150;

            const executeFromNode = async (node: any): Promise<void> => {
                if (stepCount >= maxSteps) {
                    console.warn(`Macro execution hit loop prevention limit of ${maxSteps} steps.`);
                    return;
                }
                stepCount++;

                // Execute current node, getting the list of output slots to trigger
                const triggeredSlots = await this.executeNode(node, sandbox);

                // For each triggered output slot, locate links & follow execution to target nodes
                if (triggeredSlots && triggeredSlots.length > 0 && node.outputs) {
                    for (const slotIndex of triggeredSlots) {
                        const outputDef = node.outputs[slotIndex];
                        if (outputDef && outputDef.links && outputDef.links.length > 0) {
                            for (const linkId of outputDef.links) {
                                const link = linksMap.get(linkId);
                                if (link) {
                                    const targetNode = nodesMap.get(link.target_id);
                                    if (targetNode) {
                                        await executeFromNode(targetNode);
                                    }
                                }
                            }
                        }
                    }
                }
            };

            for (const startNode of startNodes) {
                await executeFromNode(startNode);
            }

        } catch (err) {
            console.error('Macro execution failed:', err);
        } finally {
            this.isRunning = false;
            this.currentMacro = null;
        }
    }

    private async executeNode(node: any, sandbox: SandboxedFS): Promise<number[]> {
        const type = node.type;
        const props = node.properties || {};

        console.log(`Executing node: [${type}] with props:`, props);

        switch (type) {
            case 'triggers/voice':
            case 'triggers/timer':
            case 'triggers/ai_intent':
                // Triggers just flow their output triggers instantly
                return [0];

            case 'actions/launch':
                if (props.appPath && props.appPath.trim() !== '') {
                    const launchPath = props.appPath.trim();
                    console.log('Main Process executing Launch path:', launchPath);

                    const policy = PolicyEngine.evaluate('SYSTEM', launchPath, false);
                    if (!policy.allowed) {
                        console.error('[MacroExecutor] Launch blocked by PolicyEngine:', launchPath, 'Reason:', policy.reason);
                        return [1];
                    }

                    if (policy.requiresApproval) {
                        const approved = await approvalService.requestApproval({
                            actionType: 'SYSTEM',
                            target: launchPath,
                            reason: policy.reason || 'Запуск внешнего приложения в макросе',
                            metadata: { macroId: this.currentMacro?.id, nodeId: node.id }
                        });
                        if (!approved) {
                            console.warn('[MacroExecutor] Launch rejected by user approval:', launchPath);
                            return [1];
                        }
                    }

                    const spawnDetached = (cmd: string, args: string[], useShell: boolean = false) => {
                        try {
                            const child = spawn(cmd, args, {
                                detached: true,
                                stdio: 'ignore',
                                shell: useShell,
                                windowsHide: false
                            });
                            if (child && typeof child.on === 'function') {
                                child.on('error', (err) => console.error('[MacroExecutor] Detached spawn error:', err));
                            }
                            if (child && typeof child.unref === 'function') {
                                child.unref();
                            }
                        } catch (spawnErr) {
                            console.error('[MacroExecutor] Failed to spawn detached process:', spawnErr);
                        }
                    };

                    if (process.platform === 'win32') {
                        Promise.resolve(shell.openPath(launchPath)).then((errStr) => {
                            if (errStr) {
                                spawnDetached('cmd.exe', ['/c', 'start', '""', `"${launchPath}"`], true);
                            }
                        }).catch(() => {
                            spawnDetached('cmd.exe', ['/c', 'start', '""', `"${launchPath}"`], true);
                        });
                    } else if (process.platform === 'darwin') {
                        spawnDetached('open', [launchPath], false);
                    } else {
                        spawnDetached(launchPath, [], true);
                    }
                }
                return [0];

            case 'actions/url':
                if (props.url && props.url.trim() !== '') {
                    const { normalizeMacroExternalUrl } = require('../../shared/utils/url-normalizer');
                    const urlStr = normalizeMacroExternalUrl(props.url);
                    console.log('Main Process executing Open URL:', urlStr);
                    setImmediate(() => {
                        Promise.resolve(shell.openExternal(urlStr)).catch(err => console.error('shell.openExternal failed:', err));
                    });
                }
                return [0];

            case 'actions/speak':
                if (props.text && props.text.trim() !== '') {
                    const cleanText = props.text.trim();
                    console.log(`Main Process executing Speak Text via ttsService: [${cleanText.length} chars, id=${computeTtsHash(cleanText)}]`);
                    try {
                        await ttsService.speak(cleanText);
                    } catch (err) {
                        console.error('MacroExecutor actions/speak failed:', err);
                    }
                }
                return [0];


            case 'actions/shell': {
                const shellInput =
                    typeof props.executable === 'string' && props.executable.trim()
                        ? { executable: props.executable.trim(), args: Array.isArray(props.args) ? props.args.map(String) : undefined, cwd: props.cwd, purpose: props.purpose }
                        : props.command && String(props.command).trim()
                            ? String(props.command).trim()
                            : null;
                if (shellInput) {
                    const purpose = typeof props.purpose === 'string' && props.purpose.trim() ? props.purpose.trim() : 'Выполнение команды в макросе';
                    console.log('Main Process executing Shell command via ShellExecutor:', typeof shellInput === 'string' ? maskSecrets(shellInput) : maskSecrets(shellInput.executable));
                    const result = await executeShellCommand(shellInput, { macroId: this.currentMacro?.id, reason: purpose, purpose, cwd: props.cwd });
                    if (!result.success) return [1];
                }
                return [0];
            }

            case 'logic/delay':
                const ms = parseInt(props.ms) || 1000;
                console.log(`Logic: Delay of ${ms}ms starting...`);
                await new Promise(r => setTimeout(r, ms));
                return [0];

            case 'logic/if':
                let cond = false;
                try {
                    const rawCond = String(props.condition || 'true').trim().toLowerCase();
                    if (rawCond === 'true' || rawCond === '1' || rawCond === 'yes' || rawCond === 'on') {
                        cond = true;
                    } else if (rawCond === 'false' || rawCond === '0' || rawCond === 'no' || rawCond === 'off') {
                        cond = false;
                    } else {
                        cond = safeEval(rawCond, {});
                    }
                } catch (e) {
                    console.error('Failed to parse condition expression:', e);
                    cond = false;
                }
                console.log('Logic: IF evaluated to', cond);
                return cond ? [0] : [1]; // trigger true (slot 0) or false (slot 1) output branch

            case 'actions/notification': {
                const title = (props.title || 'ARC Уведомление').trim();
                const text = (props.text || 'Действие выполнено успешно').trim();
                console.log(`Action: Push Notification: [${title}] -> ${text}`);
                try {
                    if (Notification && typeof Notification.isSupported === 'function' && Notification.isSupported()) {
                        new Notification({ title, body: text }).show();
                    } else {
                        console.log('Notification not supported or main process environment mock');
                    }
                } catch (e) {
                    console.error('Failed to show system notification:', e);
                }
                return [0];
            }

            case 'actions/open_file': {
                const filePath = (props.path || '').trim();
                if (filePath) {
                    console.log('Action: Open File Path:', filePath);

                    let resolvedPath = filePath;
                    try {
                        resolvedPath = sandbox.resolvePath(filePath);
                    } catch (err: any) {
                        console.error('[MacroExecutor] open_file blocked because outside of sandbox range:', err.message);
                        return [1];
                    }

                    const policy = PolicyEngine.evaluate('FILE_READ', resolvedPath, true);
                    if (!policy.allowed) {
                        console.error('[MacroExecutor] open_file permissions denied by policy engine:', resolvedPath);
                        return [1];
                    }

                    shell.openPath(resolvedPath).catch(err => {
                        console.error('shell.openPath failed for open_file:', err);
                        if (process.platform === 'win32') {
                            exec(`start "" "${resolvedPath}"`);
                        } else if (process.platform === 'darwin') {
                            exec(`open "${resolvedPath}"`);
                        } else {
                            exec(`xdg-open "${resolvedPath}"`);
                        }
                    });
                }
                return [0];
            }

            case 'logic/toggle': {
                const nodeId = String(node.id);
                let state = this.nodeStates.get(nodeId);
                if (state === undefined) {
                    state = false; // start with OFF
                }
                state = !state;
                this.nodeStates.set(nodeId, state);
                console.log(`Logic: Toggle changed state to: ${state ? 'ON (Slot 0)' : 'OFF (Slot 1)'}`);
                return state ? [0] : [1];
            }

            case 'logic/random': {
                const bias = parseFloat(props.bias !== undefined ? props.bias : 0.5);
                const rand = Math.random();
                console.log(`Logic: Randomizer evaluation context edge bias ${bias}: value ${rand}`);
                return rand < bias ? [0] : [1];
            }

            case 'logic/counter': {
                const nodeId = String(node.id);
                let count = this.nodeStates.get(`${nodeId}_count`) || 0;
                const limit = parseInt(props.limit) || 3;
                const reset = props.resetOnLimit !== false;

                count++;
                console.log(`Logic: Counter logic current value: ${count}/${limit}`);
                
                let triggerSlotIndex = 0; // standard done
                if (count >= limit) {
                    triggerSlotIndex = 1; // limit reached
                    if (reset) {
                        count = 0;
                    }
                }
                this.nodeStates.set(`${nodeId}_count`, count);
                return [triggerSlotIndex];
            }

            default:
                console.warn('Unknown node type during macro execution:', type);
                return [0];
        }
    }
}

export const macroExecutor = new MacroExecutor();
