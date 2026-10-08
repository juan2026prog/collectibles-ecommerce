import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function isValidImage(record) {
  const url = record.official_image_url;
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  const clean = url.trim().toLowerCase();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;
  if (clean.includes('unsplash.com') || clean.includes('pexels.com') || clean.includes('placeholder')) return false;

  const prov = record.raw_source_data?.image_provenance;
  if (prov === 'NONE') return false;

  const score = record.image_match_score;
  if (score != null && Number(score) < 0.7 && Number(score) > 0 && Number(score) < 70) return false;

  return true;
}

async function migratePublicationPolicy() {
  console.log('--- REGLA EDITORIAL: SIN IMAGEN VÁLIDA, NO SE PUBLICA ---');
  
  const { data: allRecords, error } = await supabase
    .from('release_events')
    .select('id, title, is_published, approval_status, official_image_url, image_match_score, raw_source_data, source_url')
    .order('created_at', { ascending: true });

  if (error || !allRecords) {
    console.error('Error fetching release_events:', error);
    process.exit(1);
  }

  console.log(`\nESTADO ANTES DE LA MIGRACIÓN:`);
  console.log(`Total registros: ${allRecords.length}`);
  const prevPublished = allRecords.filter(r => r.is_published);
  const prevPublishedWithoutImg = prevPublished.filter(r => !isValidImage(r));
  const prevPublishedWithImg = prevPublished.filter(r => isValidImage(r));
  const prevDrafts = allRecords.filter(r => !r.is_published);
  console.log(`Publicados: ${prevPublished.length}`);
  console.log(`Publicados con imagen válida: ${prevPublishedWithImg.length}`);
  console.log(`Publicados sin imagen válida: ${prevPublishedWithoutImg.length}`);
  console.log(`Borradores: ${prevDrafts.length}`);

  let updatedToDraft = 0;
  for (const record of allRecords) {
    const valid = isValidImage(record);
    if (!valid && record.is_published) {
      const { error: updErr } = await supabase
        .from('release_events')
        .update({
          is_published: false,
          approval_status: 'DRAFT',
          updated_at: new Date().toISOString()
        })
        .eq('id', record.id);

      if (updErr) {
        console.error(`Error updating record ${record.id}:`, updErr.message);
      } else {
        updatedToDraft++;
        console.log(`→ Movido a DRAFT (sin foto válida): "${record.title}"`);
      }
    }
  }

  // Comprobar estado posterior
  const { data: afterRecords } = await supabase
    .from('release_events')
    .select('id, title, is_published, approval_status, official_image_url, image_match_score, raw_source_data');

  console.log(`\nESTADO DESPUÉS DE LA MIGRACIÓN:`);
  console.log(`Total registros en base de datos: ${afterRecords.length} (Ninguno fue borrado)`);
  const afterPublished = afterRecords.filter(r => r.is_published);
  const afterDrafts = afterRecords.filter(r => !r.is_published);
  const afterPublishedWithoutImg = afterPublished.filter(r => !isValidImage(r));

  console.log(`Publicados con imagen válida: ${afterPublished.length}`);
  console.log(`Borradores pendientes de imagen: ${afterDrafts.length}`);
  console.log(`Publicados sin imagen válida: ${afterPublishedWithoutImg.length}`);

  if (afterPublishedWithoutImg.length === 0) {
    console.log('\n✓ REGLA CUMPLIDA AL 100%: Cero registros sin imagen publicados en la plataforma.');
  } else {
    console.error('\n⚠ ALERTA: Aún quedan registros publicados sin imagen válida.');
  }
}

migratePublicationPolicy();
