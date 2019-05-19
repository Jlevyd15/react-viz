'use strict';

import * as vscode from 'vscode';

import { DepNodeProvider, Dependency } from './nodeDependencies'
import { ReactAppVizProvider } from './appViz'

export function activate(context: vscode.ExtensionContext) {
	const reactAppVizProvider = new ReactAppVizProvider(vscode.workspace.rootPath)
	vscode.window.createTreeView('reactAppViz', {
		treeDataProvider: reactAppVizProvider,
		showCollapseAll: true
	});
	vscode.commands.registerCommand('reactAppViz.openFile', path => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(path)));
	vscode.commands.registerCommand('reactAppViz.refreshEntry', () => reactAppVizProvider.refresh());
}