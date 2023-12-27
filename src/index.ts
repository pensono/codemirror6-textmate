import {EditorState, Prec, Facet, Extension, RangeSetBuilder} from "@codemirror/state"
import { IGrammar, INITIAL, IRawGrammar, IRawTheme, IToken, Registry, StackElement } from 'monaco-textmate'
import { Highlighter } from './Highlighter'
import { HighlightStyle, IndentContext, Language, StreamLanguage, StreamParser, StringStream } from '@codemirror/language'
import { Tag } from "@lezer/highlight"

export interface IHighlighterState {
    ruleStack: StackElement
    tokensCache: IToken[]
}

export interface ITextmateThemePlus extends IRawTheme {
    gutterSettings?: {
        background?: string
        divider?: string
        foreground?: string
        lineActiveBackground?: string
        lineActiveForeground?: string
    }
}

export type IRawGrammarSource = IRawGrammar | Promise<IRawGrammar> | ((scopeName: string) => IRawGrammar | Promise<IRawGrammar>)

class TextmateStreamParser implements StreamParser<IHighlighterState> {
    grammar: IGrammar;

    constructor(grammar: IGrammar) {
        this.grammar = grammar;
    }

    name?: string
    startState?(indentUnit: number): IHighlighterState {
        return { tokensCache: [], ruleStack: INITIAL }
    }
    
    token(stream: StringStream, state: IHighlighterState): string {
        const { pos, string: str } = stream
        if (pos === 0) {
            const { ruleStack, tokens } = this.grammar.tokenizeLine(str, state.ruleStack)
            state.tokensCache = tokens.slice()
            state.ruleStack = ruleStack
        }

        const { tokensCache } = state
        const nextToken = tokensCache.shift()
        if (!nextToken) {
            stream.skipToEnd()
            return null
        }
        const { endIndex, scopes } = nextToken
        stream.eatWhile(() => stream.pos < endIndex)

        return "cm-token"
        // return this.theme
        //     ? this.tmScopeToTmThemeToken(scopes)
        //     : this.tmScopeToCmToken(scopes)

    }
    blankLine?(state: IHighlighterState, indentUnit: number): void {
        // Nothing to do
    }
    copyState?(state: IHighlighterState): IHighlighterState {
        // Nothing to do
        return { tokensCache: [], ruleStack: state.ruleStack.clone() }
    }
    indent?(state: IHighlighterState, textAfter: string, context: IndentContext): number {
        throw new Error("Method not implemented.")
    }
    languageData?: { [name: string]: any }
    tokenTable?: { [name: string]: Tag | readonly Tag[] }
}

function singleRegistry(rawGrammar: IRawGrammarSource) {
    return new Registry({
        async getGrammarDefinition(scopeName: string, dependentScope: string) {
            let grammar = rawGrammar;
            if (typeof grammar === 'function') {
                grammar = grammar(scopeName)
            }

            if (grammar instanceof Promise) {
                grammar = await grammar
            }

            if (grammar !== null && typeof grammar === 'object') {
                return {
                    content: grammar as IRawGrammar,
                    format: 'json' as any,
                }
            }
            return null
        },
        getInjections(scopeName: string): string[] {
            return null
            // if (Highlighter.scopeNameToInjections.has(scopeName)) {
            //     return Array.from(Highlighter.scopeNameToInjections.get(scopeName))
            // }
        },
    })
}

export async function textmateLanguageExtension(scopeName: string, rawGrammar: IRawGrammarSource): Promise<Language> {
    const registry = singleRegistry(rawGrammar)
    const parser = new TextmateStreamParser(await registry.loadGrammar(scopeName))
    return StreamLanguage.define(parser);
}