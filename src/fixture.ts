import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {order, type Order} from './model.ts';

export async function startFixture(scenario: 'normal' | 'saved' = 'normal') {
  const orders: Order[] = [];
  const html = readFileSync(new URL('../fixture/order.html', import.meta.url));
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end(html);
    }
    if (req.method === 'GET' && req.url?.startsWith('/lookup?')) {
      const reference = new URL(req.url,'http://localhost').searchParams.get('reference');
      const match = orders.find(saved => saved.reference === reference);
      return res.end(match ? 'Found order ' + match.reference : 'No order found for ' + reference);
    }
    if (req.method !== 'POST' || req.url !== '/orders') return res.writeHead(404).end();
    if (req.headers.origin !== 'http://' + req.headers.host) return res.writeHead(403).end();
    try {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) return res.writeHead(413).end();
      }
      const saved = order.parse(JSON.parse(body));
      if (scenario === 'saved' && !orders.length) {
        orders.push(saved);
        return res.end('Submission timed out.');
      }
      if (scenario === 'normal' || !orders.some(existing => existing.reference === saved.reference)) orders.push(saved);
      res.end('Order saved: ' + saved.reference);
    } catch {
      res.writeHead(400).end('Invalid order');
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture port');
  return {orders, url:'http://127.0.0.1:' + address.port, close:()=>server.close()};
}
