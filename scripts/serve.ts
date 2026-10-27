import { startServer } from './server.ts';
import { OUT } from './site.ts';

const port = Number(process.env.PORT ?? 8000);
startServer({ root: OUT, port });
console.log(`Kana Dojo running at http://localhost:${port}`);
