"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = require("vscode");
var previewPanel_1 = require("./previewPanel");
function activate(context) {
    console.log('Antigravity Live Preview is now active!');
    var disposable = vscode.commands.registerCommand('antigravity.livePreview', function () {
        previewPanel_1.LivePreviewPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(disposable);
    vscode.workspace.onDidChangeTextDocument(function (e) {
        if (previewPanel_1.LivePreviewPanel.currentPanel) {
            previewPanel_1.LivePreviewPanel.currentPanel.doUpdate();
        }
    }, null, context.subscriptions);
    vscode.window.onDidChangeActiveTextEditor(function (e) {
        if (previewPanel_1.LivePreviewPanel.currentPanel) {
            previewPanel_1.LivePreviewPanel.currentPanel.doUpdate();
        }
    }, null, context.subscriptions);
}
function deactivate() { }
