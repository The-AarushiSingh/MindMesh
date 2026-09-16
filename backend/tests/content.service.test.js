const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inferResourceTypeFromUrl,
  extractTextFromHtml,
  normalizeContent,
} = require('../src/services/content.service');

test('inferResourceTypeFromUrl detects GitHub URLs', () => {
  assert.equal(inferResourceTypeFromUrl('https://github.com/microsoft/vscode'), 'github');
});

test('extractTextFromHtml keeps readable text while removing scripts and styles', () => {
  const html = `
    <html>
      <head>
        <script>do not include</script>
        <style>.x{color:red}</style>
      </head>
      <body>
        <h1>MindMesh</h1>
        <p>Personal knowledge management.</p>
      </body>
    </html>
  `;

  const text = extractTextFromHtml(html);

  assert.match(text, /MindMesh/);
  assert.doesNotMatch(text, /do not include/);
  assert.doesNotMatch(text, /color:red/);
});

test('normalizeContent strips repeated whitespace and trims output', () => {
  const value = '  some   text\n\nwith  extra   spaces  ';
  assert.equal(normalizeContent(value), 'some text with extra spaces');
});
