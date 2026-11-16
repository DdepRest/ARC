import type { IpcRenderer } from 'electron';

export function createDialogPreloadApi(ipcRenderer: IpcRenderer, plain: <T>(v: T) => T) {
  return {
    dialogSearch: (query: string, limit?: number, filter?: { archived?: boolean; trash?: boolean }) =>
      ipcRenderer.invoke('dialog:search', query, limit, plain(filter)),
    dialogBulkArchive: (ids: number[], archived: boolean) =>
      ipcRenderer.invoke('dialog:bulk-archive', plain(ids), archived),
    dialogMoveToTrash: (ids: number[]) =>
      ipcRenderer.invoke('dialog:move-to-trash', plain(ids)),
    dialogRestoreFromTrash: (ids: number[]) =>
      ipcRenderer.invoke('dialog:restore-from-trash', plain(ids)),
    dialogPermanentDelete: (ids: number[]) =>
      ipcRenderer.invoke('dialog:permanent-delete', plain(ids)),
    dialogGetTrashConfig: () =>
      ipcRenderer.invoke('dialog:get-trash-config'),
    dialogSetTrashConfig: (retentionDays: number | null) =>
      ipcRenderer.invoke('dialog:set-trash-config', retentionDays),
    dialogRunTrashCleanup: () =>
      ipcRenderer.invoke('dialog:run-trash-cleanup')
  };
}
