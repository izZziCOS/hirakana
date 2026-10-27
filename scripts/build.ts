import { buildSite } from './site.ts';

const assets = await buildSite();
console.log(`Built dist/ with ${assets.join(', ')}`);
