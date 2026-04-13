"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showStepDiffs = showStepDiffs;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
/**
 * Show diffs for each changed file by comparing the HEAD version (original)
 * against the current working-tree version (modified).
 */
async function showStepDiffs(workingDirectory, changedFiles) {
    // Ensure the working directory folder is open in the editor.
    const folderUri = vscode.Uri.file(workingDirectory);
    const alreadyOpen = vscode.workspace.workspaceFolders?.some((f) => f.uri.fsPath === folderUri.fsPath);
    if (!alreadyOpen) {
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, null, { uri: folderUri });
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentcadence-diff-'));
    for (const filePath of changedFiles) {
        const absolutePath = path.resolve(workingDirectory, filePath);
        const modifiedUri = vscode.Uri.file(absolutePath);
        let originalUri;
        try {
            const originalContent = (0, child_process_1.execSync)(`git show HEAD:${filePath}`, {
                cwd: workingDirectory,
                encoding: 'utf-8',
            });
            const tmpFile = path.join(tmpDir, filePath.replace(/\//g, '_'));
            fs.writeFileSync(tmpFile, originalContent, 'utf-8');
            originalUri = vscode.Uri.file(tmpFile);
        }
        catch {
            // File is new (not in HEAD). Use an empty untitled URI so the diff
            // shows everything as added.
            const emptyFile = path.join(tmpDir, `empty_${filePath.replace(/\//g, '_')}`);
            fs.writeFileSync(emptyFile, '', 'utf-8');
            originalUri = vscode.Uri.file(emptyFile);
        }
        const title = `Review: ${filePath}`;
        await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
    }
}
//# sourceMappingURL=diff-viewer.js.map