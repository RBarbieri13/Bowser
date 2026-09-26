import { readFile } from 'node:fs/promises';
import { decideWithJev, jevStatus, JevError } from '../server/jev.mjs';

const args = process.argv.slice(2);
try {
  if (args.length === 0 || (args.length === 1 && args[0] === '--status')) {
    console.log(JSON.stringify({ ...jevStatus(), liveVerified: false }, null, 2));
  } else if ((args.length === 1 && args[0] === '--smoke') || (args.length === 2 && args[0] === '--file')) {
    // The smoke test uses synthetic text; it never reads the warehouse or Yahoo session.
    const input = args[0] === '--smoke'
      ? { state: 'A quarterback completed a pass in an NFL game.', questions: { football: { type: 'noul', instructions: 'Is this text about American football?' } } }
      : JSON.parse(await readFile(args[1], 'utf8'));
    const result = await decideWithJev(input);
    if (args[0] === '--smoke' && result.answers.football.noul < 0.5) throw new JevError('smoke_failed', 'The live response was valid but failed the smoke-test classification.');
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new JevError('usage', 'Usage: npm run jev -- [--status | --smoke | --file /path/to/request.json]');
  }
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof JevError ? error.code : 'input_error', message: error instanceof JevError ? error.message : 'Could not read valid request JSON.', status: error instanceof JevError ? error.status : null }));
  process.exitCode = 1;
}
