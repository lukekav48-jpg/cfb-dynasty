// Terminal entry point: ./test.sh [filter]
import { run } from './all.js';

const args = typeof arguments !== 'undefined' ? arguments : [];
await run((line) => print(line), args[0] || '');
