/** Offline, deterministic schema snapshot from real PostgreSQL catalog introspection. */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const db = new PGlite();
try {
  // Minimal Supabase Auth contract, only for applying the public migrations locally.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,last_sign_in_at timestamptz);
    create table auth.identities(user_id uuid,provider text,provider_id text,identity_data jsonb);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;`);
  const files = (await readdir('supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  const { rows: types } = await db.query(
    `select t.oid,t.typname,t.typtype,t.typelem,n.nspname from pg_type t join pg_namespace n on n.oid=t.typnamespace`,
  );
  const byOid = new Map(types.map((type) => [type.oid, type]));
  const { rows: tables } = await db.query(
    `select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`,
  );
  const tableNames = new Set(tables.map((table) => table.relname));
  function tsType(oid) {
    const type = byOid.get(oid);
    if (!type) throw new Error(`Unknown type OID ${oid}`);
    if (type.typelem) return `(${tsType(type.typelem)})[]`;
    if (type.typtype === 'e' && type.nspname === 'public')
      return `Database['public']['Enums']['${type.typname}']`;
    if (type.typtype === 'c' && tableNames.has(type.typname))
      return `Database['public']['Tables']['${type.typname}']['Row']`;
    if (['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(type.typname))
      return 'number';
    if (type.typname === 'bool') return 'boolean';
    if (['json', 'jsonb'].includes(type.typname)) return 'Json';
    if (type.typname === 'void') return 'undefined';
    return 'string';
  }
  let output = `// Generated from PostgreSQL catalogs by pnpm db:types. Do not edit.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = {\n  public: {\n    Tables: {\n`;
  for (const table of tables) {
    const { rows: columns } = await db.query(
      `select a.attname,a.atttypid,a.attnotnull,a.atthasdef from pg_attribute a where a.attrelid=$1 and a.attnum>0 and not a.attisdropped order by a.attnum`,
      [table.oid],
    );
    output += `      ${table.relname}: {\n`;
    for (const mode of ['Row', 'Insert', 'Update']) {
      output += `        ${mode}: {\n`;
      for (const col of columns) {
        const optional =
          mode === 'Update' || (mode === 'Insert' && (!col.attnotnull || col.atthasdef));
        output += `          ${col.attname}${optional ? '?' : ''}: ${tsType(col.atttypid)}${col.attnotnull ? '' : ' | null'};\n`;
      }
      output += `        };\n`;
    }
    const { rows: relations } = await db.query(
      `select con.conname,ref.relname as referenced_relation,
      (select array_agg(a.attname order by k.ordinality) from unnest(con.conkey) with ordinality k(num,ordinality) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num) as columns,
      (select array_agg(a.attname order by k.ordinality) from unnest(con.confkey) with ordinality k(num,ordinality) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num) as referenced_columns,
      exists(select 1 from pg_constraint u where u.conrelid=con.conrelid and u.contype in ('p','u') and u.conkey=con.conkey) as one_to_one
      from pg_constraint con join pg_class ref on ref.oid=con.confrelid join pg_namespace n on n.oid=ref.relnamespace
      where con.conrelid=$1 and con.contype='f' and n.nspname='public' order by con.conname`,
      [table.oid],
    );
    output += '        Relationships: [\n';
    for (const rel of relations)
      output += `          { foreignKeyName: '${rel.conname}'; columns: ${JSON.stringify(rel.columns)}; isOneToOne: ${rel.one_to_one}; referencedRelation: '${rel.referenced_relation}'; referencedColumns: ${JSON.stringify(rel.referenced_columns)}; },\n`;
    output += '        ];\n      };\n';
  }
  output += `    };\n    Views: { [_ in never]: never };\n    Functions: {\n`;
  const { rows: functions } = await db.query(
    `select p.proname,p.proargnames,p.proargtypes::oid[] as argtypes,p.prorettype,p.proretset from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype<>'trigger'::regtype order by p.proname`,
  );
  for (const fn of functions) {
    const args = fn.argtypes
      .map((oid, index) => `${fn.proargnames[index]}: ${tsType(oid)}`)
      .join('; ');
    output += `      ${fn.proname}: { Args: ${args ? `{ ${args} }` : 'Record<PropertyKey, never>'}; Returns: ${tsType(fn.prorettype)}${fn.proretset ? '[]' : ''}; };\n`;
  }
  output += `    };\n    Enums: {\n`;
  const { rows: enums } = await db.query(
    `select t.typname,array_agg(e.enumlabel order by e.enumsortorder) as labels from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname order by t.typname`,
  );
  for (const type of enums)
    output += `      ${type.typname}: ${type.labels.map((label) => JSON.stringify(label)).join(' | ')};\n`;
  output += '    };\n    CompositeTypes: { [_ in never]: never };\n  };\n};\n';
  const target = 'packages/database/src/database.types.ts';
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8')) !== output)
      throw new Error('Types SQL obsolètes : lancez pnpm db:types.');
    console.log('Types PostgreSQL conformes aux migrations.');
  } else {
    await writeFile(target, output);
    console.log('Types générés depuis les migrations PostgreSQL.');
  }
} finally {
  await db.close();
}
