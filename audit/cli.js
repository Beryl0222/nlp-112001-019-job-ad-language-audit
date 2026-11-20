// CLI：只读取模拟资料并输出核查报告，不接收任何求职者输入。
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readMaterials } from '../materials.js';
import { classifyTables } from './classify.js';
import { reconcile } from './reconcile.js';
import { formatReport } from './report.js';

function parseArgs(argv) {
  const options = { directory: null, format: 'text', output: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '--out') {
      options.output = argv[i + 1];
      i += 1;
    } else if (arg === '--dir') {
      options.directory = pathToFileURL(`${argv[i + 1].replace(/\/?$/, '/')}`);
      i += 1;
    }
  }
  return options;
}

export async function runAudit(directory = null) {
  const tables = await readMaterials(directory ?? undefined);
  const statements = classifyTables(tables);
  return reconcile(statements);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runAudit(options.directory);
    const rendered = formatReport(result, options.format);
    if (options.output) {
      await writeFile(options.output, rendered, 'utf8');
    } else {
      process.stdout.write(`${rendered}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
