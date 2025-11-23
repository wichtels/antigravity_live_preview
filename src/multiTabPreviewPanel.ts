import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface PreviewTab {
    id: string;
    title: string;
    uri?: vscode.Uri;
    content: string;
}

export class MultiTabPreviewPanel {
    public static currentPanel: MultiTabPreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _tabs: PreviewTab[] = [];
    private _activeTabId: string = '';
    private _tabCounter: number = 0;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Create initial tab
        this._addNewTab();

        // Set up webview
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                extensionUri,
                ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || [])
            ]
        };

        // Initial render
        this._update();

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update on document changes
        let timeout: NodeJS.Timeout | undefined;
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(() => {
                    this._updateActiveTabFromEditor();
                }, 300);
            }
        }, null, this._disposables);

        // Update on editor switch
        vscode.window.onDidChangeActiveTextEditor(() => {
            this._updateActiveTabFromEditor();
        }, null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
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
                    case 'addTab':
                        this.addNewTab();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it
        if (MultiTabPreviewPanel.currentPanel) {
            MultiTabPreviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'antigravityPreview',
            'Antigravity Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    extensionUri,
                    ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || [])
                ]
            }
        );

        MultiTabPreviewPanel.currentPanel = new MultiTabPreviewPanel(panel, extensionUri);
    }

    public addNewTab() {
        this._addNewTab();
        this._update();
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

        // Try to fill with current editor
        this._updateActiveTabFromEditor();
    }

    private _switchTab(tabId: string) {
        this._activeTabId = tabId;
        this._update();
    }

    private _closeTab(tabId: string) {
        const index = this._tabs.findIndex(t => t.id === tabId);
        if (index !== -1) {
            this._tabs.splice(index, 1);

            if (this._activeTabId === tabId) {
                if (this._tabs.length > 0) {
                    this._activeTabId = this._tabs[Math.max(0, index - 1)].id;
                } else {
                    this._addNewTab();
                }
            }

            this._update();
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
            await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
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
            this._update();
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        const activeTab = this._tabs.find(t => t.id === this._activeTabId);

        if (!activeTab) {
            return this._getEmptyHtml();
        }

        // Tab Bar HTML
        const tabsHtml = this._tabs.map(tab => {
            const isActive = tab.id === this._activeTabId;
            return `
                <div class="tab ${isActive ? 'active' : ''}" 
                     onclick="switchTab('${tab.id}')">
                    <span class="tab-title">${tab.title || 'Untitled'}</span>
                    ${this._tabs.length > 1 ? `
                        <button class="tab-close" onclick="event.stopPropagation(); closeTab('${tab.id}')">×</button>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Content HTML
        let contentHtml = '';
        if (activeTab.uri && activeTab.content) {
            contentHtml = this._getPreviewContent(activeTab.content, activeTab.uri);
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
                        overflow: hidden;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: #252526;
                        border-bottom: 1px solid #3e3e42;
                        padding: 4px 8px;
                    }
                    .tab-bar {
                        display: flex;
                        overflow-x: auto;
                        flex: 1;
                    }
                    .tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 6px 12px;
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
                        width: 18px;
                        height: 18px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 3px;
                    }
                    .tab-close:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }
                    .add-tab-btn {
                        background: none;
                        border: none;
                        color: #ccc;
                        cursor: pointer;
                        padding: 6px 12px;
                        font-size: 16px;
                        transition: background 0.2s;
                    }
                    .add-tab-btn:hover {
                        background: #37373d;
                    }
                    .content-area {
                        flex: 1;
                        overflow: hidden;
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
                <div class="header">
                    <div class="tab-bar">
                        ${tabsHtml}
                    </div>
                    <button class="add-tab-btn" onclick="addTab()" title="Add new tab">+</button>
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
                    
                    function addTab() {
                        vscode.postMessage({ command: 'addTab' });
                    }
                </script>
            </body>
            </html>`;
    }

    private _getPreviewContent(htmlContent: string, documentUri: vscode.Uri): string {
        const documentDir = path.dirname(documentUri.fsPath);
        htmlContent = this._convertResourcePaths(htmlContent, documentUri);

        // Add script to prevent navigation and handle links
        const navigationScript = `
            <script>
                (function() {
                    // Prevent navigation by intercepting link clicks
                    document.addEventListener('click', function(e) {
                        const target = e.target.closest('a');
                        if (target && target.href) {
                            const href = target.getAttribute('href');
                            // Allow hash links for anchor navigation
                            if (href && href.startsWith('#')) {
                                return; // Allow default behavior for hash links
                            }
                            // Prevent navigation for all other links
                            e.preventDefault();
                            // Optionally open external links in browser
                            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                // External links - could be opened in external browser
                                console.log('External link clicked:', href);
                            }
                        }
                    }, true);
                })();
            </script>
        `;

        // Insert script before closing body tag, or at the end if no body tag
        if (htmlContent.includes('</body>')) {
            htmlContent = htmlContent.replace('</body>', navigationScript + '</body>');
        } else {
            htmlContent = htmlContent + navigationScript;
        }

        return `
            <iframe srcdoc="${this._escapeHtml(htmlContent)}" 
                    sandbox="allow-scripts allow-same-origin" 
                    style="width:100%; height:100%; border:none;">
            </iframe>
        `;
    }

    private _convertResourcePaths(html: string, documentUri: vscode.Uri): string {
        const documentDir = path.dirname(documentUri.fsPath);

        // Inline CSS files
        html = html.replace(/<link\s+([^>]*?)href=["'](?!http|https:\/\/|\/\/|data:)(.*?\.css)["']([^>]*?)>/gi, (match, before, cssPath, after) => {
            try {
                const resourcePath = path.join(documentDir, cssPath);
                if (fs.existsSync(resourcePath)) {
                    const cssContent = fs.readFileSync(resourcePath, 'utf-8');
                    return `<style>${cssContent}</style>`;
                }
            } catch (error) {
                console.error(`Failed to load CSS file: ${cssPath}`, error);
            }
            return match; // Keep original if file not found
        });

        // Convert image src paths to webview URIs
        html = html.replace(/src=["'](?!http|https:\/\/|\/\/|data:)(.*?)["']/gi, (match, p1) => {
            const resourcePath = path.join(documentDir, p1);
            const resourceUri = vscode.Uri.file(resourcePath);
            return `src="${this._panel.webview.asWebviewUri(resourceUri)}"`;
        });

        // Convert script src paths to webview URIs
        html = html.replace(/<script\s+([^>]*?)src=["'](?!http|https:\/\/|\/\/|data:)(.*?)["']([^>]*?)>/gi, (match, before, scriptPath, after) => {
            try {
                const resourcePath = path.join(documentDir, scriptPath);
                // For local scripts, we can try to inline them too
                if (fs.existsSync(resourcePath)) {
                    const scriptContent = fs.readFileSync(resourcePath, 'utf-8');
                    return `<script ${before}${after}>${scriptContent}</script>`;
                }
            } catch (error) {
                console.error(`Failed to load script file: ${scriptPath}`, error);
            }
            return match;
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

    public dispose() {
        MultiTabPreviewPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
