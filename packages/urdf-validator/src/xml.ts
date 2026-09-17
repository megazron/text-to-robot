// Tiny, dependency-free XML parser -- enough for URDF (elements, attributes,
// comments, self-closing tags, text). Not a general XML processor.
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export class XmlParseError extends Error {}

export function parseXml(src: string): XmlNode {
  let i = 0;
  const n = src.length;
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];

  const skipWs = () => { while (i < n && /\s/.test(src[i])) i++; };

  while (i < n) {
    if (src[i] !== "<") {
      const start = i;
      while (i < n && src[i] !== "<") i++;
      const txt = src.slice(start, i).trim();
      if (txt) stack[stack.length - 1].text += txt;
      continue;
    }
    // a tag
    if (src.startsWith("<!--", i)) { const end = src.indexOf("-->", i); if (end < 0) throw new XmlParseError("unterminated comment"); i = end + 3; continue; }
    if (src.startsWith("<?", i)) { const end = src.indexOf("?>", i); if (end < 0) throw new XmlParseError("unterminated processing instruction"); i = end + 2; continue; }
    if (src.startsWith("<!", i)) { const end = src.indexOf(">", i); if (end < 0) throw new XmlParseError("unterminated declaration"); i = end + 1; continue; }
    if (src.startsWith("</", i)) {
      i += 2; skipWs();
      const start = i; while (i < n && src[i] !== ">" && !/\s/.test(src[i])) i++;
      const tag = src.slice(start, i);
      const gt = src.indexOf(">", i); if (gt < 0) throw new XmlParseError("unterminated close tag");
      i = gt + 1;
      const top = stack.pop();
      if (!top || top.tag !== tag) throw new XmlParseError(`mismatched close tag </${tag}> (expected </${top?.tag}>)`);
      continue;
    }
    // open tag
    i++; skipWs();
    const start = i; while (i < n && !/[\s/>]/.test(src[i])) i++;
    const tag = src.slice(start, i);
    if (!tag) throw new XmlParseError("empty tag name");
    const node: XmlNode = { tag, attrs: {}, children: [], text: "" };
    // attributes
    while (i < n) {
      skipWs();
      if (src[i] === "/" || src[i] === ">") break;
      const as = i; while (i < n && !/[\s=/>]/.test(src[i])) i++;
      const aname = src.slice(as, i);
      skipWs();
      let aval = "";
      if (src[i] === "=") {
        i++; skipWs();
        const q = src[i];
        if (q === '"' || q === "'") { i++; const vs = i; while (i < n && src[i] !== q) i++; aval = src.slice(vs, i); i++; }
        else { const vs = i; while (i < n && !/[\s/>]/.test(src[i])) i++; aval = src.slice(vs, i); }
      }
      if (aname) node.attrs[aname] = decodeEntities(aval);
    }
    stack[stack.length - 1].children.push(node);
    if (src[i] === "/") { i++; if (src[i] === ">") i++; }         // self-closing
    else if (src[i] === ">") { i++; stack.push(node); }
  }
  if (stack.length !== 1) throw new XmlParseError(`unclosed tag <${stack[stack.length - 1].tag}>`);
  return root;
}

function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) =>
    ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e as string] as string));
}

export const findAll = (node: XmlNode, tag: string): XmlNode[] => node.children.filter((c) => c.tag === tag);
export const findFirst = (node: XmlNode, tag: string): XmlNode | undefined => node.children.find((c) => c.tag === tag);
