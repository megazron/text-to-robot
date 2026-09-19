import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HuggingFaceProvider, providerStatus, selectCloudProvider } from '../packages/llm-providers/src/index.ts';

test('Hugging Face requires explicit model, authenticates, and parses JSON', async (t) => {
  const oldToken = process.env.HF_TOKEN, oldModel = process.env.HF_MODEL;
  t.after(() => {
    if (oldToken === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = oldToken;
    if (oldModel === undefined) delete process.env.HF_MODEL; else process.env.HF_MODEL = oldModel;
  });
  process.env.HF_TOKEN = 'test-secret';
  delete process.env.HF_MODEL;
  assert.equal(new HuggingFaceProvider().available(), false);
  process.env.HF_MODEL = 'owner/model:provider';
  assert.equal(selectCloudProvider()?.name, 'huggingface');
  assert.equal(providerStatus().huggingface, true);
  const calls: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, opts: any) => {
    assert.equal(url, 'https://router.huggingface.co/v1/chat/completions');
    assert.equal(opts.headers.Authorization, 'Bearer test-secret');
    const body = JSON.parse(opts.body); calls.push(body);
    assert.equal(body.model, 'owner/model:provider');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"robot_name":"hf_arm","links":[],"joints":[]}' } }] }));
  });
  const hf = new HuggingFaceProvider();
  const spec = await hf.generateSpec('build an arm');
  assert.equal(spec.robot_name, 'hf_arm');
  await hf.modifySpec(spec, 'extend its reach');
  assert.match(calls[1].messages[1].content, /extend its reach/);
  assert.match(calls[1].messages[1].content, /hf_arm/);
  t.mock.method(globalThis, 'fetch', async () => new Response('test-secret', { status: 401 }));
  await assert.rejects(hf.generateSpec('arm'), /^Error: Hugging Face HTTP 401$/);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({choices: []})));
  await assert.rejects(hf.generateSpec('arm'), /returned no text/);
});
