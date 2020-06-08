import { ASTNodeTypes, TxtNode, TxtParentNode, TxtNodePosition } from '@textlint/ast-node-types';
import { TextlintPluginProcessor, TextlintPluginOptions } from '@textlint/types';
import * as ts from 'typescript';

function traverse(srcfile: ts.SourceFile, node: ts.Node, callback: (node: ts.Node) => void) {
    if (node == null) {
        return;
    }
    for (const child of node.getChildren(srcfile)) {
        callback(child);
        traverse(srcfile, child, callback);
    }
}

function getTxtNodePosition(lineStarts: readonly number[], pos: number): TxtNodePosition {
    let line = 0;
    for (; line< lineStarts.length; line++) {
        if (lineStarts[line] > pos) {
            break;
        }
    }
    return {
        line,
        column: lineStarts[line - 1]
    };
}

function parse(text: string): TxtParentNode | {
    text: string;
    ast: TxtParentNode;
} {
    const children: TxtParentNode['children'] = [];
    const srcfile = ts.createSourceFile('__', text, ts.ScriptTarget.ES2015);
    const lineStarts = srcfile.getLineStarts();
    traverse(srcfile, srcfile, (node) => {
        if (!ts.isJSDoc(node) || node.comment == null) {
            return;
        }
        children.push({
            type: ASTNodeTypes.Str,
            raw: node.comment,
            value: node.comment,
            range: [node.getStart(srcfile), node.getEnd()],
            loc: {
                start: getTxtNodePosition(lineStarts, node.getStart(srcfile)),
                end: getTxtNodePosition(lineStarts, node.end)
            }
        });
    });
    const splitted = text.split(/\r?\n/g);

    /**
     * TODO: Documentの直下にStrのノードを並べているだけだが、問題ないか確認する。
     * @textlint/text-to-ast (textlint-plugin-textのパーサ)を見ると、Paragraphノードでラップしている。
     * また、空行はBreakノードに置き換えている。
     */
    return {
        type: ASTNodeTypes.Document,
        raw: text,
        range: [0, text.length],
        loc: {
            start: {
                line: 1,
                column: 0
            },
            end: {
                line: splitted.length,
                column: splitted[splitted.length - 1].length
            }
        },
        children
    };
}

export class TypescriptProcessor implements TextlintPluginProcessor {
    config: TextlintPluginOptions
    constructor(config = {}) {
        this.config = config;
    }
    availableExtensions(): string[] {
        return ['.ts', '.tsx'].concat(this.config.extensions ? this.config.extensions : []);
    }
    processor(extension: string) {
        return {
            preProcess(text: string, _filePath?: string) {
                return parse(text);
            },
            postProcess(messages: any[], filePath?: string) {
                return {
                    messages,
                    filePath: filePath ? filePath : "<typescript>"
                };
            }
        };
    }
}
