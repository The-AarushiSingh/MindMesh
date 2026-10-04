const { normalizeContent } = require("./content.service");

const DEFAULT_MAX_CHARS = 900;
const DEFAULT_OVERLAP = 120;
const MAX_CHUNKS = 40;

const splitLongText = (text, maxChars) => {
  const pieces = [];
  let rest = text.trim();

  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) pieces.push(rest);
  return pieces;
};

const chunkText = (value = "", { maxChars = DEFAULT_MAX_CHARS, overlap = DEFAULT_OVERLAP } = {}) => {
  const normalized = normalizeContent(value);
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const packed = [];
  let current = "";

  const pushCurrent = () => {
    const text = current.trim();
    if (!text) return;
    packed.push(text);
    const tail = text.slice(-overlap).trim();
    current = tail;
  };

  sentences.forEach((sentence) => {
    const parts = sentence.length > maxChars ? splitLongText(sentence, maxChars) : [sentence];

    parts.forEach((part) => {
      const next = current ? `${current} ${part}` : part;
      if (next.length > maxChars && current.trim()) {
        pushCurrent();
        current = current ? `${current} ${part}`.trim() : part;
        if (current.length > maxChars) {
          splitLongText(current, maxChars).forEach((piece, index, list) => {
            if (index < list.length - 1) packed.push(piece);
            else current = piece;
          });
        }
      } else {
        current = next;
      }
    });
  });

  if (current.trim()) packed.push(current.trim());

  return packed.slice(0, MAX_CHUNKS).map((text, index) => ({
    index,
    text,
  }));
};

module.exports = {
  chunkText,
  DEFAULT_MAX_CHARS,
  DEFAULT_OVERLAP,
  MAX_CHUNKS,
};
