// Lets `node --test` run the app's TypeScript core directly (Node 22.18+ strips types).
// App code imports without extensions (Metro style); this hook adds ".ts".
import { register } from 'node:module';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`npm test needs Node.js 22.18 or newer (it runs the TypeScript tests directly). You have ${process.versions.node}.`);
  console.error('The app itself runs on Node 20.19+; only the tests need the newer version.');
  process.exit(1);
}

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !/\\.[a-z]+$/.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    throw err;
  }
}`),
  import.meta.url,
);
