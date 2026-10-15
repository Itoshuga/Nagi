import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geographyForReferences, listPublishedPlaces, routeDocuments } from '../src/lib/geography/repository.ts';
import { listContents } from '../src/lib/contents/store.ts';
import { PublicDataUnavailable, publicRead } from '../src/lib/public-data/errors.ts';
import { demonstrationDestinations } from '../fixtures/catalogue/helpers/geography-demo.ts';

function database(records) {
  const trace = [];
  const snapshot = (path) => ({ id:path.split('/')[1], exists:Boolean(records[path]), data:()=>records[path] });
  function collection(kind, filters=[], order=[], after=[], limit=Infinity) {
    const query = {
      doc(id) { return { path:`${kind}/${id}` }; },
      where(...filter) { return collection(kind,[...filters,filter],order,after,limit); },
      orderBy(field) { return collection(kind,filters,[...order,typeof field==='string'?field:'id'],after,limit); },
      startAfter(...values) { return collection(kind,filters,order,values,limit); },
      limit(value) { return collection(kind,filters,order,after,value); },
      async get() {
        trace.push({ kind, filters, limit, order });
        let docs = Object.keys(records).filter(path=>path.startsWith(`${kind}/`)).map(snapshot);
        docs=docs.filter(doc=>filters.every(([field,op,value])=>op==='=='?doc.data()[field]===value:op==='array-contains'?doc.data()[field].includes(value):op==='>='?doc.data()[field]>=value:op==='<='?doc.data()[field]<=value:false));
        const value = (doc,field)=>field==='id'?doc.id:doc.data()[field];
        docs.sort((a,b)=>{for(const field of order){if(value(a,field)<value(b,field))return -1;if(value(a,field)>value(b,field))return 1;}return 0;});
        if(after.length) docs=docs.filter(doc=>{for(let i=0;i<order.length;i++){if(value(doc,order[i])>after[i])return true;if(value(doc,order[i])<after[i])return false;}return false;});
        docs=docs.slice(0,limit);return {docs,empty:!docs.length,size:docs.length};
      },
    };return query;
  }
  return { trace, collection, async getAll(...refs) { trace.push({batch:refs.map(ref=>ref.path)});return refs.map(ref=>snapshot(ref.path)); } };
}
function geographyRecords() { return Object.fromEntries(demonstrationDestinations().map(item=>[`${item.kind}/${item.id}`,item])); }

test('la résolution interroge les slugs dans leur parent et respecte les publications',async()=>{
  const records=geographyRecords();const db=database(records);
  const data=await routeDocuments(db,'japon','tokyo','asakusa');assert.equal(data.districts.length,1);
  assert.ok(db.trace.every(call=>call.limit===2));
  assert.ok(db.trace[1].filters.some(([field,,value])=>field==='countryId'&&value==='country-jp'));
  assert.ok(db.trace[2].filters.some(([field,,value])=>field==='cityId'&&value==='city-jp-tokyo'));
  assert.equal((await routeDocuments(db,'japon','kyoto','asakusa')).districts.length,0);
  records['countries/country-jp'].status='draft';assert.equal((await routeDocuments(db,'japon','tokyo')).cities.length,0);
});
test('les ascendances sont groupées, seules les références publiques sont projetées',async()=>{
  const records=geographyRecords();const db=database(records);
  records['districts/district-tokyo-ueno'].visibility='private';
  const refs=Array.from({length:30},()=>[{kind:'district',id:'district-tokyo-ueno'},{kind:'district',id:'district-tokyo-asakusa'}]).flat();
  const geo=await geographyForReferences(db,refs);
  assert.deepEqual(geo.districts.map(item=>item.id),['district-tokyo-asakusa']);
  assert.equal(geo.cities.length,1);assert.equal(db.trace.length,3);assert.equal(db.trace[0].batch.length,2);
  assert.ok(db.trace.every(call=>call.batch));
});
test('les listes géographiques sont bornées et leurs curseurs liés au parent',async()=>{
  const records=geographyRecords();const db=database(records);
  const first=await listPublishedPlaces(db,'cities','country-jp',undefined,2);
  assert.equal(first.documents[0].id,'city-jp-tokyo');assert.deepEqual(db.trace[0].order,['sortOrder','name','id']);
  assert.equal(first.documents.length,2);assert.ok(first.nextCursor);
  const second=await listPublishedPlaces(db,'cities','country-jp',first.nextCursor,2);
  assert.equal(new Set([...first.documents,...second.documents].map(item=>item.id)).size,4);
  assert.equal((await listPublishedPlaces(db,'districts','city-jp-tokyo',first.nextCursor)).invalidCursor,true);
  assert.equal(db.trace[0].limit,3);
  records['cities/city-jp-tokyo'].sortOrder=100;
  assert.equal((await listPublishedPlaces(db,'cities','country-jp',undefined,1)).documents[0].id,'city-jp-kyoto');
});
test('la requête publique de fiches filtre type, publication, visibilité, archive et géographie avant sa limite',async()=>{
  const db=database({});await listContents(db,{type:'adresses',geo:'city:town',q:'Sakura'},true);
  const query=db.trace[0];assert.equal(query.limit,25);
  for(const filter of [['type','==','adresses'],['status','==','published'],['visibility','==','public'],['isArchived','==',false],['geographyKeys','array-contains','city:town'],['searchTitle','>=','sakura']])assert.ok(query.filters.some(value=>JSON.stringify(value)===JSON.stringify(filter)));
});
test('une panne reste distincte de vide et les logs excluent le message privé du SDK',async()=>{
  const original=console.error;const logs=[];console.error=(...values)=>logs.push(values);
  try { assert.deepEqual(await publicRead('test.empty',async()=>[]),[]);await assert.rejects(()=>publicRead('test.unavailable',async()=>{throw {code:14,message:'PRIVATE KEY confidential.example'};}),PublicDataUnavailable); }
  finally {console.error=original;}
  assert.equal(JSON.stringify(logs).includes('PRIVATE KEY'),false);assert.equal(JSON.stringify(logs).includes('14'),true);
});
test('aucune source de production ne dépend des fixtures ou des outils d’import',()=>{
  function inspect(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())inspect(path);else if(/\.[cm]?[jt]sx?$/.test(item.name)){const source=readFileSync(path,'utf8');assert.doesNotMatch(source,/["']\/destinations\/[a-z][a-z0-9-]+(?:\/[a-z0-9-]+)*["']/ ,path);assert.doesNotMatch(source,/(?:from\s*|import\s*\()\s*["'][^"']*(?:fixtures\/|scripts\/migrations|data\/(?:geography|discoveries|catalogue|.*-covers|.*-photographs))["']/ ,path);}}}
  inspect('src');
});
