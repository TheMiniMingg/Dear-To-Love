// Minimal OpenAI-compatible (and Ollama-native) server for E2E: scripted
// streamed replies.
import http from 'node:http';

/**
 * @param {Array<{status?: number, pieces?: string[], delayMs?: number}>} script
 *   One entry per chat request, in order.
 */
export async function startFakeOpenAI(script) {
  const requests = [];
  const queue = [...script];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      requests.push({ method: req.method, url: req.url, body });
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'story-model' }] }));
        return;
      }
      if (req.url.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'story-model' }] }));
        return;
      }
      const step = queue.shift() ?? { status: 500 };
      if (step.status && step.status !== 200) {
        res.writeHead(step.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'scripted failure' } }));
        return;
      }
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        for (const p of step.pieces ?? []) {
          res.write(
            `${JSON.stringify({ message: { role: 'assistant', content: p }, done: false })}\n`,
          );
          await new Promise((r) => setTimeout(r, step.delayMs ?? 30));
        }
        res.end(
          `${JSON.stringify({ done: true, done_reason: 'stop', prompt_eval_count: 50, eval_count: 12 })}\n`,
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const p of step.pieces ?? []) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, step.delayMs ?? 30));
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write(
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 12 } })}\n\n`,
      );
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    root: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}
