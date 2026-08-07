import React, { useMemo, useState } from 'react';
import { Code, Copy, Check, CaretDown, CaretRight, FileText, BracketsCurly } from '@phosphor-icons/react';
import { EchoesContentBlock, EchoesFormat } from '../../types';

/**
 * Echoes 多格式内容渲染器。
 *
 * 设计原则：小说正文优先可读；结构化资料保持原格式；所有格式都有纯文本降级。
 * HTML 只经过白名单清洗后渲染，SVG / Mermaid / PlantUML 当前默认显示安全源码，
 * 等专用渲染器接入后仍可沿用同一内容块协议，不需要改故事数据。
 */

const FORMAT_LABELS: Record<EchoesFormat, string> = {
    text: '纯文本', markdown: 'Markdown', html: 'HTML', latex: 'LaTeX', code: '代码',
    json: 'JSON', xml: 'XML', yaml: 'YAML', csv: 'CSV', tsv: 'TSV', sql: 'SQL',
    svg: 'SVG', mermaid: 'Mermaid', plantuml: 'PlantUML', mindmap: '思维导图',
};

const CODE_FORMATS = new Set<EchoesFormat>([
    'latex', 'code', 'json', 'xml', 'yaml', 'sql', 'svg', 'mermaid', 'plantuml', 'mindmap',
]);

const escapeUnsafeHtml = (html: string): string => {
    if (typeof DOMParser === 'undefined') {
        return html.replace(/<\/?[a-z][^>]*>/gi, '').replace(/javascript:/gi, '');
    }
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return html.replace(/<[^>]*>/g, '');
    const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'base']);
    const allowed = new Set(['DIV', 'SPAN', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'HR', 'SMALL', 'MARK']);
    Array.from(root.querySelectorAll('*')).forEach((node) => {
        const el = node as HTMLElement;
        if (blocked.has(el.tagName.toLowerCase()) || !allowed.has(el.tagName)) {
            el.replaceWith(...Array.from(el.childNodes));
            return;
        }
        Array.from(el.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim();
            if (name.startsWith('on') || name === 'style' || name === 'src' || name === 'srcdoc' || name === 'id' || name === 'class') {
                el.removeAttribute(attr.name);
                return;
            }
            if (name === 'href' && !/^(https?:|mailto:|#)/i.test(value)) el.removeAttribute(attr.name);
            else if (!['href', 'target', 'rel', 'colspan', 'rowspan'].includes(name)) el.removeAttribute(attr.name);
        });
        if (el.tagName === 'A') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noreferrer noopener');
        }
    });
    return root.innerHTML;
};

const parseInline = (text: string, accent: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|~~[^~]+~~)/g);
    return parts.map((part, index) => {
        if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={index} style={{ color: accent }}>{part.slice(2, -2)}</strong>;
        if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={index} className="opacity-80">{part.slice(1, -1)}</em>;
        if (/^~~.*~~$/.test(part)) return <del key={index} className="opacity-60">{part.slice(2, -2)}</del>;
        if (/^`.*`$/.test(part)) return <code key={index} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[.9em]">{part.slice(1, -1)}</code>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
};

const MarkdownView: React.FC<{ content: string; accent: string }> = ({ content, accent }) => {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    return <div className="space-y-3 leading-[1.85] text-justify">
        {lines.map((raw, index) => {
            const line = raw.trim();
            if (!line) return <div key={index} className="h-1" />;
            if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) return <hr key={index} className="border-current opacity-15 my-4" />;
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                const size = heading[1].length === 1 ? 'text-xl' : heading[1].length === 2 ? 'text-lg' : 'text-base';
                return <div key={index} className={`${size} font-bold tracking-wide`} style={{ color: heading[1].length === 1 ? accent : undefined }}>{parseInline(heading[2], accent)}</div>;
            }
            if (/^>\s?/.test(line)) return <blockquote key={index} className="border-l-2 pl-3 italic opacity-75" style={{ borderColor: accent }}>{parseInline(line.replace(/^>\s?/, ''), accent)}</blockquote>;
            const bullet = line.match(/^[-*•]\s+(.+)$/);
            if (bullet) return <div key={index} className="flex gap-2 pl-1"><span style={{ color: accent }}>•</span><span>{parseInline(bullet[1], accent)}</span></div>;
            const numbered = line.match(/^\d+[.)]\s+(.+)$/);
            if (numbered) return <div key={index} className="flex gap-2 pl-1"><span className="font-mono opacity-55">{line.match(/^\d+/)?.[0]}.</span><span>{parseInline(numbered[1], accent)}</span></div>;
            return <p key={index} className="m-0">{parseInline(line, accent)}</p>;
        })}
    </div>;
};

const parseDelimited = (content: string, delimiter: string): string[][] => {
    return content.trim().split(/\r?\n/).slice(0, 60).map((line) => {
        const cells: string[] = [];
        let current = ''; let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const c = line[i];
            if (c === '"') { quoted = !quoted; continue; }
            if (c === delimiter && !quoted) { cells.push(current.trim()); current = ''; } else current += c;
        }
        cells.push(current.trim());
        return cells.slice(0, 16);
    });
};

const DataTable: React.FC<{ content: string; delimiter: string; accent: string }> = ({ content, delimiter, accent }) => {
    const rows = parseDelimited(content, delimiter);
    if (!rows.length) return <pre className="whitespace-pre-wrap">{content}</pre>;
    const head = rows[0];
    return <div className="overflow-x-auto rounded-xl border border-black/10"><table className="min-w-full text-left text-xs"><thead><tr>{head.map((cell, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-bold" style={{ color: accent, background: `${accent}12` }}>{cell || `列 ${i + 1}`}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, r) => <tr key={r} className="border-t border-black/5">{head.map((_, c) => <td key={c} className="whitespace-pre-wrap px-3 py-2 align-top">{row[c] || ''}</td>)}</tr>)}</tbody></table></div>;
};

const prettyStructured = (content: string, format: EchoesFormat): string => {
    if (format !== 'json') return content;
    try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
};

export const EchoesContentRenderer: React.FC<{
    block: EchoesContentBlock;
    accent?: string;
    sourceVisible?: boolean;
}> = ({ block, accent = '#7c3aed', sourceVisible = false }) => {
    const [copied, setCopied] = useState(false);
    const [collapsed, setCollapsed] = useState(!!block.collapsible);
    const format = block.format || 'text';
    const source = useMemo(() => prettyStructured(block.content || '', format), [block.content, format]);
    const copy = async () => {
        try { await navigator.clipboard?.writeText(block.content || ''); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch { /* clipboard unavailable */ }
    };
    const isCode = CODE_FORMATS.has(format);
    return <section className={`echoes-content-block echoes-kind-${block.kind} ${isCode ? 'echoes-code-block' : ''} my-3`}>
        {(block.title || isCode || format === 'html') && <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] opacity-55">
            {isCode ? <Code size={14} /> : format === 'html' ? <BracketsCurly size={14} /> : <FileText size={14} />}
            {block.title && <span className="normal-case tracking-normal font-semibold opacity-90">{block.title}</span>}
            <span>{FORMAT_LABELS[format]}</span>
            <button onClick={() => setCollapsed((v) => !v)} className="ml-auto rounded p-1 hover:bg-black/5" aria-label={collapsed ? '展开' : '折叠'}>{collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}</button>
        </div>}
        {!collapsed && <>
            {sourceVisible ? <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-black/90 p-4 text-[11px] leading-relaxed text-emerald-300">{source}</pre> : (
                format === 'html' ? <div className="echoes-html rounded-xl border border-black/10 p-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: escapeUnsafeHtml(source) }} />
                : format === 'csv' ? <DataTable content={source} delimiter="," accent={accent} />
                : format === 'tsv' ? <DataTable content={source} delimiter="\t" accent={accent} />
                : format === 'markdown' ? <MarkdownView content={source} accent={accent} />
                : format === 'text' ? <div className="whitespace-pre-wrap leading-relaxed">{source}</div>
                : <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-black/[.06] p-4 font-mono text-[11px] leading-relaxed">{source}</pre>
            )}
            <div className="mt-1 flex justify-end gap-1"><button onClick={copy} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] opacity-45 hover:bg-black/5 hover:opacity-90">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? '已复制' : '复制'}</button>{sourceVisible && <span className="self-center text-[10px] opacity-35">源码视图</span>}</div>
        </>}
    </section>;
};

export default EchoesContentRenderer;
