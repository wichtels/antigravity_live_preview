import * as vscode from 'vscode';
import { MultiTabPreviewPanel } from './multiTabPreviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Live Preview by Torsten Wich Heiter is now active!');

    // Main command to open preview
    let openPreviewCommand = vscode.commands.registerCommand('antigravity.openPreview', () => {
        MultiTabPreviewPanel.createOrShow(context.extensionUri);
    });

    // Refresh Command
    let refreshCommand = vscode.commands.registerCommand('antigravity.refresh', () => {
        if (MultiTabPreviewPanel.currentPanel) {
            MultiTabPreviewPanel.currentPanel.refresh();
        }
    });

    // Add Tab Command
    let addTabCommand = vscode.commands.registerCommand('antigravity.addTab', () => {
        if (MultiTabPreviewPanel.currentPanel) {
            MultiTabPreviewPanel.currentPanel.addNewTab();
        } else {
            MultiTabPreviewPanel.createOrShow(context.extensionUri);
        }
    });

    context.subscriptions.push(openPreviewCommand);
    context.subscriptions.push(refreshCommand);
    context.subscriptions.push(addTabCommand);
}

export function deactivate() { }
