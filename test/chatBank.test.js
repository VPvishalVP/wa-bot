const test = require('node:test');
const assert = require('node:assert/strict');
const { getChatReply } = require('../chatBank');

test('recognizes greeting patterns', () => {
  const reply = getChatReply('Good morning bhai');
  assert.match(reply, /Good morning|Suprabhat|Morning bhai/i);
});

test('recognizes ordinary hi greeting', () => {
  const reply = getChatReply('hi');
  assert.match(reply, /Hello|Hey|Namaste|Hii/i);
});

test('calculates addition', () => {
  assert.equal(getChatReply('what is 2 + 3'), '5');
});

test('calculates subtraction, multiplication, and division', () => {
  assert.equal(getChatReply('10 - 4'), '6');
  assert.equal(getChatReply('6 * 7'), '42');
  assert.equal(getChatReply('12 / 3'), '4');
});

test('handles division by zero safely', () => {
  assert.equal(getChatReply('5 / 0'), 'Zero se divide nahi kar sakte.');
});

test('returns null for empty input', () => {
  assert.equal(getChatReply('   '), null);
});

test('returns a reply for an unmatched non-empty message', () => {
  assert.equal(typeof getChatReply('unusual words xyz'), 'string');
});
