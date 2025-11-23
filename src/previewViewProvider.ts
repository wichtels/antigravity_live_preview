import * as vscode from 'vscode';
import * as path from 'path';

interface PreviewTab {
    id: string;
    title: string;
    uri?: vscode.Uri;
    content: string;
}

export class PreviewViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'antigravity.previewPanel';
    private _view?: vscode.WebviewView;
    private _tabs: PreviewTab[] = [];
    private _activeTabId: string = '';
    private _tabCounter: number = 0;

    constructor(private readonly _extensionUri: vscode.Uri) {
        // Create initial tab
        this._addNewTab();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || [])
            ]
        };

        // Initial HTML
        this._updateView();

        // Update on document changes (with debounce)
        let timeout: NodeJS.Timeout | undefined;
        vscode.workspace.onDidChangeTextDocument(e => {
            if (this._view && e.document === vscode.window.activeTextEditor?.document) {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(() => {
                    this._updateActiveTabFromEditor();
                }, 300);
            }
        });

        // Update on editor switch
        vscode.window.onDidChangeActiveTextEditor(() => {
            this._updateActiveTabFromEditor();
        });

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'selectFile':
                    await this._selectFile();
                    break;
                case 'switchTab':
                    this._switchTab(message.tabId);
                    break;
                case 'closeTab':
                    this._closeTab(message.tabId);
                    break;
            }
        });
    }

    public addNewTab() {
        this._addNewTab();
        this._updateView();
    }

    private _addNewTab() {
        this._tabCounter++;
        const newTab: PreviewTab = {
            id: `tab-${this._tabCounter}`,
            title: `Tab ${this._tabCounter}`,
            content: ''
        };
        this._tabs.push(newTab);
        this._activeTabId = newTab.id;
    }

    private _switchTab(tabId: string) {
        this._activeTabId = tabId;
        this._updateView();
    }

    private _closeTab(tabId: string) {
        const index = this._tabs.findIndex(t => t.id === tabId);
        if (index !== -1) {
            this._tabs.splice(index, 1);

            // If active tab was closed
            if (this._activeTabId === tabId) {
                if (this._tabs.length > 0) {
                    this._activeTabId = this._tabs[Math.max(0, index - 1)].id;
                } else {
                    this._addNewTab();
                }
            }

            this._updateView();
        }
    }

    private async _selectFile() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Preview',
            filters: {
                'HTML': ['html', 'htm']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);

        if (fileUri && fileUri[0]) {
            const document = await vscode.workspace.openTextDocument(fileUri[0]);
            await vscode.window.showTextDocument(document);
            this._updateActiveTabFromEditor();
        }
    }

    public refresh() {
        this._updateActiveTabFromEditor();
    }

    private _updateActiveTabFromEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'html') {
            return;
        }

        const activeTab = this._tabs.find(t => t.id === this._activeTabId);
        if (activeTab) {
            activeTab.uri = editor.document.uri;
            activeTab.title = path.basename(editor.document.fileName);
            activeTab.content = editor.document.getText();
            this._updateView();
        }
    }

    private _updateView() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const activeTab = this._tabs.find(t => t.id === this._activeTabId);

        if (!activeTab) {
            return this._getEmptyHtml();
        }

        // Tab Bar HTML
        const tabsHtml = this._tabs.map(tab => {
            const isActive = tab.id === this._activeTabId;
            return `
                <div class="tab ${isActive ? 'active' : ''}" 
                     data-tab-id="${tab.id}"
                     onclick="switchTab('${tab.id}')">
                    <span class="tab-title">${tab.title || 'Untitled'}</span>
                    ${this._tabs.length > 1 ? `
                        <button class="tab-close" onclick="event.stopPropagation(); closeTab('${tab.id}')">
                            ×
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Content HTML
        let contentHtml = '';
        if (activeTab.uri && activeTab.content) {
            contentHtml = this._getPreviewContent(activeTab.content, activeTab.uri, webview);
        } else {
            contentHtml = this._getFileBrowserHtml();
        }

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: 'Segoe UI', sans-serif;
                        background: #1e1e1e;
                        color: #ccc;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    .tab-bar {
                        display: flex;
                        background: #252526;
                        border-bottom: 1px solid #3e3e42;
                        overflow-x: auto;
                        flex-shrink: 0;
                    }
                    .tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 12px;
                        background: #2d2d30;
                        border-right: 1px solid #3e3e42;
                        cursor: pointer;
                        user-select: none;
                        white-space: nowrap;
                        transition: background 0.2s;
                    }
                    .tab:hover {
                        background: #37373d;
                    }
                    .tab.active {
                        background: #1e1e1e;
                        border-bottom: 2px solid #8a2be2;
                    }
                    .tab-title {
                        font-size: 13px;
                    }
                    .tab-close {
                        background: none;
                        border: none;
                        color: #858585;
                        font-size: 18px;
                        cursor: pointer;
                        padding: 0;
                        width: 20px;
                        height: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 3px;
                    }
                    .tab-close:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }
                    .content-area {
                        flex: 1;
                        overflow: auto;
                        background: white;
                    }
                    iframe {
                        width: 100%;
                        height: 100%;
                        border: none;
                    }
                </style>
            </head>
            <body>
                <div class="tab-bar">
                    ${tabsHtml}
                </div>
                <div class="content-area">
                    ${contentHtml}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function switchTab(tabId) {
                        vscode.postMessage({ command: 'switchTab', tabId: tabId });
                    }
                    
                    function closeTab(tabId) {
                        vscode.postMessage({ command: 'closeTab', tabId: tabId });
                    }
                    
                    function selectFile() {
                        vscode.postMessage({ command: 'selectFile' });
                    }
                </script>
            </body>
            </html>`;
    }

    private _getPreviewContent(htmlContent: string, documentUri: vscode.Uri, webview: vscode.Webview): string {
        const documentDir = path.dirname(documentUri.fsPath);
        htmlContent = this._convertResourcePaths(htmlContent, documentUri, webview);

        return `
            <iframe srcdoc="${this._escapeHtml(htmlContent)}" 
                    sandbox="allow-scripts allow-same-origin" 
                    style="width:100%; height:100vh; border:none;">
            </iframe>
        `;
    }

    private _convertResourcePaths(html: string, documentUri: vscode.Uri, webview: vscode.Webview): string {
        const documentDir = path.dirname(documentUri.fsPath);

        html = html.replace(/href=["'](?!http|https|\/\/|data:)(.*?)["']/gi, (match, p1) => {
            const resourcePath = path.join(documentDir, p1);
            const resourceUri = vscode.Uri.file(resourcePath);
            return `href="${webview.asWebviewUri(resourceUri)}"`;
        });

        html = html.replace(/src=["'](?!http|https|\/\/|data:)(.*?)["']/gi, (match, p1) => {
            const resourcePath = path.join(documentDir, p1);
            const resourceUri = vscode.Uri.file(resourcePath);
            return `src="${webview.asWebviewUri(resourceUri)}"`;
        });

        return html;
    }

    private _escapeHtml(html: string): string {
        return html
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private _getFileBrowserHtml(): string {
        return `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1e1e1e;">
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 20px;">📄</div>
                    <h2 style="color: #fff; margin-bottom: 10px;">No HTML File Loaded</h2>
                    <p style="color: #888; margin-bottom: 30px;">Open an HTML file in the editor or select one.</p>
                    <button onclick="selectFile()" 
                            style="background: linear-gradient(135deg, #8a2be2, #4169e1); 
                                   color: white; border: none; padding: 12px 24px; 
                                   border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                        Select HTML File
                    </button>
                </div>
            </div>
        `;
    }

    private _getEmptyHtml(): string {
        return `<!DOCTYPE html>
            <html>
            <body style="background: #1e1e1e; color: #ccc; display: flex; align-items: center; justify-content: center; height: 100vh;">
                <div>No tabs</div>
            </body>
            </html>`;
    }
}
