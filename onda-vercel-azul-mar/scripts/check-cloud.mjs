/** Read-only diagnostic. Does not create an admin, change products or upload files. */
import { configuration, createCloud } from '../lib/cloud.mjs';
try {
  const config=configuration();
  if(!config.configured) throw new Error(`Configure: ${config.missing.join(', ')}`);
  const cloud=createCloud(config);
  const result=await cloud.diagnostics();
  const catalog=await cloud.catalog();
  console.log(JSON.stringify({...result,realProducts:catalog.products.length,categories:catalog.categories.length},null,2));
  if(!result.adminConfigured) throw new Error('Execute setup/02-ADMIN.sql para autorizar seu administrador.');
  console.log('Conexao com banco e Storage confirmada. O login e o upload ainda devem ser testados no navegador.');
} catch(error) { console.error(error.message); process.exitCode=1; }
