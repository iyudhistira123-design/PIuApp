import { transform } from "sucrase";
import runtime from "./preview-runtime.txt?raw";
const js = JSON.stringify;
export function compilePreview(files: Record<string, string>, select = false) {
  const modules: Record<string, string> = {};
  const css = Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, s]) => s)
    .join("\n");
  for (const [path, source] of Object.entries(files)) {
    if (/\.(tsx?|jsx?)$/.test(path) && !path.endsWith("main.tsx")) {
      modules[path] = transform(source, {
        transforms: ["typescript", "jsx", "imports"],
        production: true,
        filePath: path,
      }).code;
    }
  }
  const moduleScript = `const modules=${js(modules)};const cache={};function resolve(path,from){if(!path.startsWith('.'))return path;const bits=from.split('/');bits.pop();for(const bit of path.split('/')){if(bit==='..')bits.pop();else if(bit!=='.')bits.push(bit);}return bits.join('/');}function load(path,from='src/App.tsx'){if(path==='react')return window.__PIWU_REACT__;if(path==='react-dom/client')return {createRoot:window.__PIWU_ROOT__};if(path.endsWith('.css'))return {};let id=resolve(path,from);if(!modules[id])id=[id+'.tsx',id+'.ts',id+'.jsx',id+'.js',id+'/index.tsx'].find(x=>modules[x]);if(!id||!modules[id])throw new Error('Modul belum tersedia di preview lokal: '+path);if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;new Function('require','module','exports',modules[id])(p=>load(p,id),module,module.exports);return module.exports;}try{const App=load('./App').default;window.__PIWU_ROOT__(document.getElementById('root')).render(window.__PIWU_REACT__.createElement(App));}catch(e){parent.postMessage({type:'piwu-error',message:e.message},'*');document.getElementById('root').textContent='Preview gagal: '+e.message;}`;
  const bridge = `window.addEventListener('error',e=>parent.postMessage({type:'piwu-error',message:e.message},'*'));window.addEventListener('unhandledrejection',e=>parent.postMessage({type:'piwu-error',message:String(e.reason)},'*'));const original=console.log;console.log=(...args)=>{parent.postMessage({type:'piwu-log',message:args.map(x=>String(x)).join(' ')},'*');original(...args);};${select ? `document.addEventListener('mouseover',e=>{if(e.target instanceof HTMLElement){document.querySelectorAll('[data-piwu-hover]').forEach(x=>{x.style.outline='';x.removeAttribute('data-piwu-hover');});e.target.dataset.piwuHover='1';e.target.style.outline='2px solid #3866ff';}});document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const el=e.target;const s=getComputedStyle(el);parent.postMessage({type:'piwu-select',tag:el.tagName.toLowerCase(),text:el.innerText?.slice(0,300)||'',selector:el.id?'#'+el.id:el.className?'.'+el.className.trim().split(' ').join('.'):el.tagName.toLowerCase(),color:s.color,background:s.backgroundColor,fontSize:s.fontSize},'*');},true);` : ""}`;
  const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none';"><style>${css.replace(/<\/style/gi, "")}</style></head><body><div id="root"></div><script>${safe(bridge)}</script><script>${safe(runtime)}</script><script>${safe(moduleScript)}</script></body></html>`;
}
