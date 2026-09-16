const { URL } = require("url");

const normalizeContent = (value = "") => {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\s*([.,!?;:])\s*/g, "$1 ")
    .trim();
};

const inferResourceTypeFromUrl = (url) => {
  if (typeof url !== "string" || !url.trim()) {
    return "other";
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes("github.com")) return "github";
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("linkedin.com")) return "linkedin-post";
    if (hostname.includes("x.com") || hostname.includes("twitter.com")) return "x-post";
    if (hostname.includes("docs.")) return "documentation";

    return "article";
  } catch {
    return "other";
  }
};

const decodeHtmlEntities = (value = "") => {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
};

const extractTextFromHtml = (html = "") => {
  if (!html) return "";

  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);

  return normalizeContent(decoded);
};

const extractTitleFromHtml = (html = "") => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return normalizeContent(titleMatch[1]);
  }

  const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (headingMatch) {
    return normalizeContent(headingMatch[1]);
  }

  return "Saved resource";
};

const fetchPageContent = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MindMesh/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const html = await response.text();
    const content = extractTextFromHtml(html);

    return {
      url: response.url,
      html,
      content,
      title: extractTitleFromHtml(html),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildSummary = (content = "") => {
  const sentenceMatch = content.match(/[^.!?]+[.!?]+/g);
  if (sentenceMatch && sentenceMatch.length > 0) {
    const firstSentence = sentenceMatch[0].trim();
    if (firstSentence.length > 0) {
      return firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trim()}...` : firstSentence;
    }
  }

  return content.length > 220 ? `${content.slice(0, 217).trim()}...` : content;
};

const processResourceContent = async ({ url, title, description }) => {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("A valid resource URL is required");
  }

  const trimmedUrl = url.trim();

  try {
    const page = await fetchPageContent(trimmedUrl);
    const content = page.content || "";

    if (!content) {
      throw new Error("No readable content was found for the provided URL");
    }

    return {
      url: trimmedUrl,
      title: title && title.trim() ? title.trim() : page.title,
      description: description || buildSummary(content),
      content,
      summary: buildSummary(content),
      type: inferResourceTypeFromUrl(trimmedUrl),
    };
  } catch (error) {
    throw new Error(error.message || "Could not process the resource content");
  }
};

module.exports = {
  normalizeContent,
  inferResourceTypeFromUrl,
  extractTextFromHtml,
  extractTitleFromHtml,
  fetchPageContent,
  buildSummary,
  processResourceContent,
};
