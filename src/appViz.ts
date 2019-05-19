import { parse as babelParser } from '@babel/parser';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

export class ReactAppVizProvider implements vscode.TreeDataProvider<Dependency> {

  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined>
    = new vscode.EventEmitter<Dependency | undefined>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined>
    = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string) {
  }

  buildAbsPath(element: Dependency, rootCompPath: string) {
    const pathToMatch = path.basename(element.importPath)
    const options = {
      cwd: rootCompPath,
      ignore: 'node_modules/**'
    }
    const result = glob.sync(`**/${pathToMatch}.{js, jsx, json}`, options)
    return result.length ? path.resolve(rootCompPath, result[0]) : undefined
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  // TODO - do we want to allow custom file ext to be ignored?
  checkFileIsOfType(filePath: string): boolean {
    const regex = /^\.+.*(([^css])|(.js|.jsx))$/g
    return regex.test(filePath)
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {
    const settingsPropertyRootComp = vscode.workspace.getConfiguration('reactAppViz').get('rootComponent')
    const settingsPropertyCompPath = vscode.workspace.getConfiguration('reactAppViz').get('componentsPath')

    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('Workspace is empty');
      return Promise.resolve([]);
    }

    // read the package.json file
    const packageJsonPath = path.resolve(this.workspaceRoot, 'package.json');
    // exit if we can't read the file
    if (!this.pathExists(packageJsonPath)) {
      vscode.window.showInformationMessage('Could not find package.json file');
      return Promise.resolve([]);
    }

    // Account for workspace with multiple folders versus single folder???
    const settingsRootComponentPath = path.resolve(this.workspaceRoot, settingsPropertyCompPath, settingsPropertyRootComp)
    // TODO - if an element exists here that means the user clicked the expand button on the tree
    // we need dive another level deeper into the ast content
    if (element) {
      const absPath = this.buildAbsPath(element, path.resolve(this.workspaceRoot, settingsPropertyCompPath))
      // check if absPath is undefined. If it is that means we're at the end of the branch and should not make it collapsible dependency item
      return Promise.resolve(this.getComponentAst(element.importPath, packageJsonPath, absPath));
    } else {
      // if we don't find a path set in the ext settings, use a sensible default
      // this is the top level of the ast tree
      const rootComponentPath: string = settingsRootComponentPath || path.resolve(this.workspaceRoot, './src/App.js');
      if (this.pathExists(rootComponentPath)) {
        return Promise.resolve(this.getComponentAst(rootComponentPath, packageJsonPath, settingsRootComponentPath));
      } else {
        vscode.window.showInformationMessage('Could not find root component, please add the path to in settings');
        return Promise.resolve([]);
      }
    }

  }

	/**
	 * Given the Babel AST object return the body array with only import declarations
	 * @param astContent 
	 * @returns AST body with only import declarations
	 */
  private filterAstContent(astContent: any): Array<object> {
    if (!astContent) return []
    // TODO - give astContent a type definition
    return astContent.program.body.filter(({ type }) => type === 'ImportDeclaration')
  }

	/**
	 * Given the path to package.json, read all its dependencies and devDependencies.
	 */
  private getComponentAst(rootComponentPath: string, packageJsonPath: string, absPath: string): Dependency[] | undefined {
    // const fullPath = this.resolveFileExt(path.resolve(this.workspaceRoot, settingsPropertyCompPath, rootComponentPath))
    if (!absPath) return []
    if (this.pathExists(absPath)) {
      // get the ast content
      const rootComponent = fs.readFileSync(absPath, 'utf8')
      const ast = babelParser(rootComponent, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'classProperties'
        ]
      })
      const astContent = ast

      // read the package.json file
      const packageJsonContents = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      // combine dependencies and devDeps
      const combindDeps = [...Object.keys(packageJsonContents.dependencies), ...Object.keys(packageJsonContents.devDependencies)]

      // TODO - fix "any" type
      const toDep = (component: any, absPath: string): Dependency => {
        // if (this.pathExists(path.join(this.workspaceRoot, 'node_modules', component))) {
        if (component && component.specifiers && component.specifiers.length) {
          // TODO - there can be multiple imports in the import statement
          // EX: import React, {useState, useEffect} from 'react
          const componentName = component.specifiers[0].local.name
          const componentPath = component.source.value

          if (!this.checkFileIsOfType(componentPath)) return undefined
          // TODO - Includes on Array is not in the ES6 spec. Either use ES7 in tsconfig or change to indexOf
          return !!combindDeps.find(dep => dep === componentName.toLowerCase()) ?
            undefined : new Dependency(componentName, componentPath, absPath, vscode.TreeItemCollapsibleState.Collapsed, {
              command: 'reactAppViz.openFile',
              title: 'Open File',
              arguments: [absPath]
            });
        }
        // do something else if there is no more children
        // else {
        // 	return new Dependency(componentName, componentPath, absPath, vscode.TreeItemCollapsibleState.None);
        // this maps to a command in the package.json file, 
        // {
        // 	command: 'extension.openPackageOnNpm',
        // 	title: '',
        // 	arguments: [com]
        // });
        // }
      }
      const filteredAst = this.filterAstContent(astContent)
      const body = filteredAst.map(dep => toDep(dep, absPath));
      return body
    } else {
      return [];
    }
  }

  // Checks that the ext has access to read this file
  private pathExists(path: string): boolean {
    try {
      fs.accessSync(path);
    } catch (err) {
      return false;
    }
    return true;
  }

  // Adds file extension if none exists
  private resolveFileExt(path) {
    const exts = ['.js', '.jsx', '.json']
    let resolvedExt
    // if the file path already is formatted just return it
    if (fs.existsSync(path)) return path;
    for (let i = 0; i < exts.length; i++) {
      const pathAndExtension = path + exts[i]
      if (fs.existsSync(pathAndExtension)) {
        resolvedExt = pathAndExtension;
        break;
      }
    }
    return resolvedExt;
  }
}

export class Dependency extends vscode.TreeItem {

  constructor(
    public readonly label: string,
    public readonly importPath: string,
    public readonly absPath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
  }

  get tooltip(): string {
    return `${this.absPath}`;
  }

  // get description(): string {
  // 	return this.version;
  // }

  iconPath = {
    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
  };

  contextValue = 'dependency';

}
