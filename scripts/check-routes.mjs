import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Utiliser un serveur local de vérification.");
const pages = new Map(); const queue = ["/"]; const queued = new Set(queue);
const links = []; const images = new Set(); const universes = ["tourisme", "activites", "gastronomie", "adresses"];
const decode = (value) => value.replaceAll("&amp;", "&");
function key(url) { const query=new URLSearchParams(url.search); query.sort(); return url.pathname+(query.size?`?${query}`:""); }
// Parcourir les liens réellement publiés, sans supposer l’existence du Japon ni
// importer une fixture. Fonctionne aussi avec un pays sans ville ou une base vide.
while(queue.length) {
  const route=queue.shift(); assert.ok(pages.size<5000,"Catalogue de vérification trop volumineux.");
  const response=await fetch(new URL(route,origin)); assert.equal(response.status,200,route);
  const html=await response.text(); const current=new URL(route,origin); pages.set(route,html);
  for(const [pattern,name] of [[/<h1\b/g,'titre h1'],[/<main\b/g,'contenu principal'],[/<header class="site-header\b/g,'en-tête']])assert.equal((html.match(pattern)??[]).length,1,`${route} : ${name}`);
  assert.match(html,/<html[^>]*lang="fr"/); assert.match(html,/<title>[^<]+<\/title>/); assert.doesNotMatch(html,/<meta name="robots" content="noindex"/);
  if(/^\/(?:decouvertes|destinations)\/.+/.test(current.pathname)){
    const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]; assert.ok(canonical,route);assert.equal(new URL(canonical).pathname,current.pathname);assert.equal(new URL(canonical).search,"");
  }
  if(html.includes('role="tablist"')){
    const tabs=[...html.matchAll(/<a\b[^>]*role="tab"[^>]*>/g)].map(([tag])=>tag);assert.equal(tabs.length,4,route);
    const requested=current.searchParams.getAll('onglet');const expected=requested.length===1&&universes.includes(requested[0])?requested[0]:'tourisme';
    assert.ok(tabs.some(tag=>tag.includes(`id="tab-${expected}"`)&&tag.includes('aria-selected="true"')),route);
    const path=current.pathname.split('/').filter(Boolean);
    for(const universe of universes){const redirect=await fetch(new URL(`${current.pathname}/explorer/${universe}`,origin),{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),`${current.pathname}?onglet=${universe}#univers`);}
    assert.ok(path.length===3||path.length===4);
  }
  if(current.pathname.startsWith('/decouvertes/')){assert.doesNotMatch(html,/discovery-story-gallery/);assert.match(html,/discovery-story section-shell/);}
  for(const [,raw] of html.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)="([^"]*)"/g)){
    const url=new URL(decode(raw),current);if(url.origin!==origin.origin)continue;
    if(url.pathname.startsWith('/_next/')||url.pathname.startsWith('/images/')||url.pathname.startsWith('/api/photos/')){images.add(url.pathname+url.search);continue;}
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin'))continue;
    const target=key(url);links.push({source:route,target,hash:url.hash});if(!queued.has(target)){queued.add(target);queue.push(target);}
  }
}
for(const {source,target,hash} of links){assert.ok(pages.has(target),`${source} → ${target}`);if(hash)assert.ok(pages.get(target).includes(`id="${decodeURIComponent(hash.slice(1))}"`),`${source} → ${hash}`);}
for(const image of images){const response=await fetch(new URL(image,origin));assert.equal(response.status,200,image);assert.match(response.headers.get('content-type'),/^image\//);}
for(const path of ['/destinations/nagi-introuvable','/destinations/nagi-introuvable/ville','/decouvertes/inconnu/fiche','/decouvertes/tourisme/nagi-introuvable']){
  const response=await fetch(new URL(path,origin));assert.equal(response.status,404,path);const html=await response.text();assert.match(html,/Cet horizon reste/);assert.match(html,/<meta name="robots" content="noindex"/);
}
console.info(`${pages.size} pages et variantes, ${links.length} liens internes et ${images.size} images vérifiés depuis le seul catalogue Firestore.`);
