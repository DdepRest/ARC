import { describe, it, expect, beforeEach } from 'vitest';
import path from 'os';
import { isPathAllowed, setCustomAllowedRoots, clearCustomAllowedRoots, getAllowedRoots } from './files.service';

describe('FilesService - Path Traversal Protection', () => {
  beforeEach(() => {
    clearCustomAllowedRoots();
  });

  it('should block system directories and path traversal attempts', () => {
    setCustomAllowedRoots(['/app/sandbox/user_data']);

    // Outside system paths
    expect(isPathAllowed('/etc/passwd')).toBe(false);
    expect(isPathAllowed('/etc/shadow')).toBe(false);
    expect(isPathAllowed('C:\\Windows\\System32\\config\\SAM')).toBe(false);
    expect(isPathAllowed('C:\\Program Files')).toBe(false);

    // Path traversal escapes
    expect(isPathAllowed('/app/sandbox/user_data/../../etc/passwd')).toBe(false);
    expect(isPathAllowed('/app/sandbox/user_data/../other')).toBe(false);

    // Null bytes
    expect(isPathAllowed('/app/sandbox/user_data/test\0.txt')).toBe(false);
  });

  it('should allow paths within authorized roots', () => {
    setCustomAllowedRoots(['/app/sandbox/user_data']);

    expect(isPathAllowed('/app/sandbox/user_data')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data/arc.db')).toBe(true);
    expect(isPathAllowed('/app/sandbox/user_data/nested/folder/file.json')).toBe(true);
  });
});
