import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Utiliser un serveur local de vérification.");
const pages = new Map();
const queue = ["/"];
const queued = new Set(queue);
const links = [];
const images = new Set();
const titles = new Map();
const universes = ["tourisme", "activites", "gastronomie", "adresses"];
const geographicRoutes = [
  ...["tokyo", "kyoto", "osaka", "fujiyoshida"].map((slug) => `/destinations/japon/${slug}`),
  ...["shinjuku", "ueno", "asakusa", "shibuya", "ginza"].map((slug) => `/destinations/japon/tokyo/${slug}`),
];
const districtCityRoutes = ["/destinations/japon/tokyo"];
const tabRoutes = geographicRoutes;
const decodeHref = (value) => value.replaceAll("&amp;", "&");
const pageKey = (url) => tabRoutes.includes(url.pathname) && universes.includes(url.searchParams.get("onglet")) ? `${url.pathname}?onglet=${url.searchParams.get("onglet")}` : url.pathname;
const selectedTab = (html) => [...html.matchAll(/<a\b[^>]*role="tab"[^>]*>/g)].find(([tag]) => tag.includes('aria-selected="true"'))?.[0].match(/id="tab-([^"]+)"/)?.[1];

// Parcours réel du HTML : toutes les fiches doivent être atteignables depuis l’accueil.
while (queue.length > 0) {
  const route = queue.shift();
  const response = await fetch(new URL(route, origin));
  assert.equal(response.status, 200, route);
  const html = await response.text();
  const pathname = new URL(route, origin).pathname;
  pages.set(route, html);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${route} : un titre h1`);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${route} : un contenu principal`);
  assert.equal((html.match(/<header class="site-header\b/g) ?? []).length, 1, `${route} : un en-tête de site`);
  assert.match(html, /<html[^>]*lang="fr"/, `${route} : langue française`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, `${route} : titre SEO`);
  if (titles.has(pathname)) assert.equal(title, titles.get(pathname), "Les onglets ne changent pas le titre canonique.");
  else assert.ok(![...titles.values()].includes(title), `${route} : titre SEO distinct`);
  titles.set(pathname, title);
  assert.match(html, /<meta name="description" content="[^"]+"/, `${route} : description SEO`);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex"/, `${route} : page indexable`);
  if (geographicRoutes.includes(pathname) || route.startsWith("/decouvertes/")) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${route} : URL canonique`);
    assert.equal(new URL(canonical).pathname, pathname);
    assert.equal(new URL(canonical).search, "");
  }
  if (route.startsWith("/decouvertes/")) {
    assert.doesNotMatch(html, /<footer\b/, `${route} : aucun pied de page sous la fiche`);
    assert.ok((html.match(/<img\b/g) ?? []).length <= 1, `${route} : une seule photographie, sans galerie ni cartes supplémentaires`);
  }
  if (districtCityRoutes.includes(pathname)) {
    assert.match(html, /id="quartiers"/, `${route} : liste des quartiers`);
    assert.match(html, /href="#quartiers"/, `${route} : accès principal aux quartiers`);
    assert.match(html, /id="univers"/, `${route} : les univers restent présents au niveau de la ville`);
  }
  if (tabRoutes.includes(pathname)) {
    const expected = new URL(route, origin).searchParams.get("onglet") ?? "tourisme";
    assert.equal(selectedTab(html), expected, `${route} : onglet sélectionné dès le HTML serveur`);
    const tabs = [...html.matchAll(/<a\b[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);
    assert.equal(tabs.length, 4);
    assert.equal(tabs.filter((tag) => tag.includes('tabindex="0"')).length, 1);
    const panels = [...html.matchAll(/<div\b[^>]*role="tabpanel"[^>]*>/g)].map(([tag]) => tag);
    assert.equal(panels.length, 4);
    assert.equal(panels.filter((tag) => /\bhidden(?:=|\s|>)/.test(tag)).length, 3);
    for (const slug of universes) {
      assert.ok(tabs.some((tag) => tag.includes(`aria-controls="panel-${slug}"`)));
      assert.ok(panels.some((tag) => tag.includes(`id="panel-${slug}"`) && tag.includes(`aria-labelledby="tab-${slug}"`)));
    }
  }
  for (const [, rawHref] of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
    const url = new URL(decodeHref(rawHref), new URL(route, origin));
    if (url.origin !== origin.origin) continue;
    assert.ok(!url.pathname.includes("/explorer/"), `${route} : aucun lien interne vers une ancienne catégorie`);
    const target = pageKey(url);
    links.push({ route, target, hash: url.hash });
    if (!queued.has(target)) { queued.add(target); queue.push(target); }
  }
  for (const [, rawSource] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) images.add(decodeHref(rawSource));
  assert.ok(pages.size <= 100, "Le parcours ne doit pas boucler sur des routes inattendues.");
}

assert.equal(titles.size, 32, "Accueil + 11 destinations + 20 fiches, sans page de catégorie distincte");
assert.equal(pages.size, 32 + tabRoutes.length * universes.length, "32 pages et 36 variantes d’onglets sur les 9 destinations locales");
for (const { route, target, hash } of links) {
  assert.ok(pages.has(target), `${route} → ${target}`);
  if (hash) assert.ok(pages.get(target).includes(`id="${decodeURIComponent(hash.slice(1))}"`), `${route} → ${hash}`);
}
for (const source of images) {
  const response = await fetch(new URL(source, origin));
  assert.equal(response.status, 200, `Image : ${source}`);
  assert.ok(response.headers.get("content-type")?.startsWith("image/"), source);
}

const hasLink = (html, pathname) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].some(([, href]) => new URL(decodeHref(href), origin).pathname === pathname);
const countLink = (html, pathname) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].filter(([, href]) => new URL(decodeHref(href), origin).pathname === pathname).length;
assert.match(pages.get("/"), /href="\/destinations"[^>]*>[\s\S]*?Explorer les destinations/);
for (const slug of ["tokyo", "kyoto", "osaka", "fujiyoshida"]) assert.ok(hasLink(pages.get("/destinations/japon"), `/destinations/japon/${slug}`));
for (const slug of ["shinjuku", "ueno", "asakusa", "shibuya", "ginza"]) assert.ok(hasLink(pages.get("/destinations/japon/tokyo"), `/destinations/japon/tokyo/${slug}`));
for (const route of tabRoutes) {
  for (const universe of universes) assert.ok(pages.get(route).includes(`href="${route}?onglet=${universe}#univers"`));
}
assert.doesNotMatch(pages.get("/destinations/japon/fujiyoshida"), /id="quartiers"|href="#quartiers"/);
assert.match(pages.get("/destinations/japon/fujiyoshida?onglet=adresses"), /Une page encore à écrire/);
assert.ok(hasLink(pages.get("/destinations/japon/fujiyoshida?onglet=tourisme"), "/decouvertes/tourisme/honcho-dori"));
assert.ok(!hasLink(pages.get("/destinations/japon/tokyo/asakusa?onglet=adresses"), "/decouvertes/adresses/maisen-aoyama"));
assert.equal(countLink(pages.get("/destinations/japon/tokyo/shinjuku?onglet=gastronomie"), "/decouvertes/gastronomie/tonkatsu"), 1);
assert.match(pages.get("/decouvertes/gastronomie/tonkatsu"), /href="\/destinations\/japon\/tokyo\/shinjuku\?onglet=gastronomie#univers"/);
assert.match(pages.get("/decouvertes/adresses/maisen-aoyama"), /href="\/destinations\/japon\/tokyo\?onglet=adresses#univers"/);
for (const address of ["ginza-bairin", "maisen-aoyama"]) {
  assert.ok(hasLink(pages.get("/decouvertes/gastronomie/tonkatsu"), `/decouvertes/adresses/${address}`));
  assert.ok(hasLink(pages.get(`/decouvertes/adresses/${address}`), "/decouvertes/gastronomie/tonkatsu"));
}
for (const specialty of ["monjayaki", "okonomiyaki"]) assert.ok(hasLink(pages.get("/decouvertes/adresses/kamiya-kaminarimon"), `/decouvertes/gastronomie/${specialty}`));
assert.ok(hasLink(pages.get("/decouvertes/activites/carnet-croquis-ueno"), "/decouvertes/tourisme/parc-ueno"));
assert.ok(hasLink(pages.get("/decouvertes/tourisme/parc-ueno"), "/decouvertes/activites/carnet-croquis-ueno"));
assert.match(pages.get("/decouvertes/adresses/maisen-aoyama"), /Photographie à venir/);
assert.doesNotMatch(pages.get("/decouvertes/gastronomie/taiyaki"), /class="discovery-sheet-related"/, "Une fiche sans relation ne montre pas de rubrique vide.");
assert.match(pages.get("/destinations/japon/tokyo"), /id="catalogue-query"/, "La ville garde accès à ses découvertes, même avec des quartiers.");
assert.doesNotMatch(pages.get("/destinations/japon/fujiyoshida?onglet=tourisme"), /id="catalogue-query"/);

for (const query of ["?onglet=inconnu", "?onglet=", "?onglet=gastronomie&onglet=adresses"]) {
  const response = await fetch(new URL(`/destinations/japon/tokyo/asakusa${query}`, origin));
  assert.equal(response.status, 200);
  assert.equal(selectedTab(await response.text()), "tourisme");
}
let redirects = 0;
for (const route of geographicRoutes) for (const universe of universes) {
  const response = await fetch(new URL(`${route}/explorer/${universe}`, origin), { redirect: "manual" });
  assert.equal(response.status, 308, `${route}/explorer/${universe}`);
  assert.equal(response.headers.get("location"), `${route}?onglet=${universe}#univers`);
  redirects++;
}

for (const query of ["?depuis=district-tokyo-shinjuku&univers=gastronomie", "?depuis=https://example.com&univers=inconnu"]) {
  const response = await fetch(new URL(`/decouvertes/gastronomie/tonkatsu${query}`, origin));
  assert.equal(response.status, 200);
  const html = await response.text();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.ok(canonical);
  assert.equal(new URL(canonical).search, "", "Le contexte ne crée pas de nouvelle fiche canonique.");
}

const missingRoutes = [
  "/destinations/inconnu", "/destinations/japon/inconnue", "/destinations/japon/tokyo/inconnu",
  "/destinations/japon/kyoto/asakusa", "/destinations/japon/fujiyoshida/shinjuku",
  "/destinations/inconnu/tokyo/asakusa", "/destinations/japon/tokyo/asakusa/tourisme",
  "/destinations/japon/tokyo/explorer/inconnu", "/destinations/japon/kyoto/asakusa/explorer/tourisme",
  "/destinations/japon/tokyo/explorer", "/decouvertes/inconnu/tonkatsu", "/decouvertes/gastronomie/inconnu",
  "/decouvertes/tourisme/tonkatsu",
];
for (const route of missingRoutes) {
  const response = await fetch(new URL(route, origin));
  assert.equal(response.status, 404, route);
  const html = await response.text();
  assert.match(html, /Cet horizon reste/);
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${route} : une seule structure de page`);
}

console.log(`${titles.size} pages et ${pages.size - titles.size} variantes d’onglets HTTP 200, ${links.length} liens internes, ${images.size} variantes d’images, ${redirects} redirections 308 et ${missingRoutes.length} pages 404 vérifiés. Sélection initiale, ARIA, relations et URL canoniques contrôlés.`);
