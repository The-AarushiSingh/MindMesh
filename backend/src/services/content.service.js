const { URL } = require("url");
const logger = require("../utils/logger");

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

const isBlockedHost = (hostname = "") => {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
};

const assertFetchableUrl = (value) => {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Please provide a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be saved");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  if (isBlockedHost(parsed.hostname)) {
    throw new Error("That URL points to a private or local address and cannot be fetched");
  }

  return parsed;
};

const fetchText = async (url, { accept = "text/html,application/xhtml+xml", timeoutMs = 12000 } = {}) => {
  const parsed = assertFetchableUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "MindMesh/1.0",
        Accept: accept,
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const finalUrl = response.url || parsed.toString();
    const finalHost = new URL(finalUrl).hostname;
    if (isBlockedHost(finalHost)) {
      throw new Error("The URL redirected to a private or local address");
    }

    const body = await response.text();
    return {
      url: finalUrl,
      body: body.length > 1500000 ? body.slice(0, 1500000) : body,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Fetching the URL timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchGitHubContent = async (url) => {
  const parsed = assertFetchableUrl(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("GitHub URL must include an owner and repository");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;

  const repoResponse = await fetchText(apiRoot, { accept: "application/vnd.github+json" });
  let metadata = {};
  try {
    metadata = JSON.parse(repoResponse.body);
  } catch {
    throw new Error("GitHub did not return repository metadata");
  }

  let readme = "";
  try {
    const readmeResponse = await fetchText(`${apiRoot}/readme`, {
      accept: "application/vnd.github.raw",
    });
    readme = readmeResponse.body;
  } catch (error) {
    logger.warn("content.github.readme_failed", { url, message: error.message });
  }

  const content = [metadata.description || "", readme].filter(Boolean).join("\n\n");
  if (!content.trim()) {
    throw new Error("No readable README or description was found for this GitHub repository");
  }

  return {
    url,
    title: metadata.full_name || `${owner}/${repo}`,
    content: content.slice(0, 100000),
    contentSource: "fetched",
    extractionNote: readme
      ? "Extracted from the GitHub repository description and README."
      : "Extracted from the GitHub repository description. A README was not available.",
  };
};

const fetchYouTubeContent = async (url) => {
  const parsed = assertFetchableUrl(url);
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.toString())}&format=json`;
  const response = await fetchText(endpoint, { accept: "application/json" });

  let metadata;
  try {
    metadata = JSON.parse(response.body);
  } catch {
    throw new Error("YouTube did not return video metadata");
  }

  const title = metadata.title || "YouTube video";
  const author = metadata.author_name ? ` by ${metadata.author_name}` : "";
  const content = `${title}${author}. Transcript text is not available from the URL alone.`;

  return {
    url,
    title,
    content,
    contentSource: "limited",
    extractionNote: "Only the public video title and author were available. MindMesh does not fetch YouTube transcripts.",
  };
};

const fetchPageContent = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    assertFetchableUrl(url);
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

    const finalUrl = response.url || url;
    if (isBlockedHost(new URL(finalUrl).hostname)) {
      throw new Error("The URL redirected to a private or local address");
    }

    const html = await response.text();
    const boundedHtml = html.length > 1500000 ? html.slice(0, 1500000) : html;
    const content = extractTextFromHtml(boundedHtml);

    return {
      url: finalUrl,
      html: boundedHtml,
      content,
      title: extractTitleFromHtml(boundedHtml),
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Fetching the URL timed out");
    }
    throw error;
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

  const type = inferResourceTypeFromUrl(trimmedUrl);

  try {
    let extracted;

    if (type === "github") {
      extracted = await fetchGitHubContent(trimmedUrl);
    } else if (type === "youtube") {
      extracted = await fetchYouTubeContent(trimmedUrl);
    } else {
      const page = await fetchPageContent(trimmedUrl);
      if (!page.content) {
        throw new Error("No readable content was found. The site may block fetching or render content only in the browser.");
      }
      extracted = {
        url: trimmedUrl,
        title: page.title,
        content: page.content.slice(0, 100000),
        contentSource: "fetched",
        extractionNote: "",
      };
    }

    const content = extracted.content || "";
    if (!content.trim()) {
      throw new Error("No readable content was found for the provided URL");
    }

    return {
      url: trimmedUrl,
      title: title && title.trim() ? title.trim() : extracted.title,
      description: description || buildSummary(content),
      content,
      summary: buildSummary(content),
      type,
      contentSource: extracted.contentSource || "fetched",
      extractionNote: extracted.extractionNote || "",
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
  assertFetchableUrl,
  isBlockedHost,
};
