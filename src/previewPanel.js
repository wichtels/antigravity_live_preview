"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePreviewPanel = void 0;
var vscode = require("vscode");
var LivePreviewPanel = /** @class */ (function () {
    function LivePreviewPanel(panel, extensionUri) {
        var _this = this;
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        // Set the webview's initial html content
        this._update();
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(function () { return _this.dispose(); }, null, this._disposables);
        // Update the content based on view changes
        this._panel.onDidChangeViewState(function (e) {
            if (_this._panel.visible) {
                _this._update();
            }
        }, null, this._disposables);
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(function (message) {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }
    LivePreviewPanel.createOrShow = function (extensionUri) {
        var column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        // If we already have a panel, show it.
        if (LivePreviewPanel.currentPanel) {
            LivePreviewPanel.currentPanel._panel.reveal(column);
            return;
        }
        // Otherwise, create a new panel.
        var panel = vscode.window.createWebviewPanel(LivePreviewPanel.viewType, 'Live Preview', column || vscode.ViewColumn.One, {
            // Enable javascript in the webview
            enableScripts: true,
            // And restrict the webview to only loading content from our extension's `media` directory.
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
        });
        LivePreviewPanel.currentPanel = new LivePreviewPanel(panel, extensionUri);
    };
    LivePreviewPanel.prototype.dispose = function () {
        LivePreviewPanel.currentPanel = undefined;
        // Clean up our resources
        this._panel.dispose();
        while (this._disposables.length) {
            var x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    };
    LivePreviewPanel.prototype.doUpdate = function () {
        this._update();
    };
    LivePreviewPanel.prototype._update = function () {
        var webview = this._panel.webview;
        this._panel.title = 'Live Preview';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    };
    LivePreviewPanel.prototype._getHtmlForWebview = function (webview) {
        // Get the active text editor's content if it's an HTML file
        var editor = vscode.window.activeTextEditor;
        var content = '<h1>No active HTML file</h1>';
        if (editor && editor.document.languageId === 'html') {
            content = editor.document.getText();
        }
        return "<!DOCTYPE html>\n\t\t\t<html lang=\"en\">\n\t\t\t<head>\n\t\t\t\t<meta charset=\"UTF-8\">\n\t\t\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n\t\t\t\t<title>Live Preview</title>\n\t\t\t</head>\n\t\t\t<body>\n\t\t\t\t".concat(content, "\n\t\t\t</body>\n\t\t\t</html>");
    };
    LivePreviewPanel.viewType = 'livePreview';
    return LivePreviewPanel;
}());
exports.LivePreviewPanel = LivePreviewPanel;
