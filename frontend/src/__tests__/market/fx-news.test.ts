/**
 * fx-news.test.ts
 *
 * Unit tests for the /api/market/news/fx route logic.
 * Tests the pure buildFxNewsArticles function in isolation.
 */

import { buildFxNewsArticles } from "../../lib/market/transforms";
import type { FxNewsArticle } from "../../lib/market/types";

const makeFinnhubItem = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  headline: "Fed holds rates steady amid inflation concerns",
  summary: "The Federal Reserve kept interest rates unchanged at its latest meeting.",
  source: "Reuters",
  url: "https://reuters.com/article/1001",
  datetime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  category: "forex",
  ...overrides,
});

// ─── buildFxNewsArticles ──────────────────────────────────────────────────────

describe("buildFxNewsArticles", () => {
  it("maps a valid Finnhub item to FxNewsArticle shape", () => {
    const raw = [makeFinnhubItem()];
    const result = buildFxNewsArticles(raw);

    expect(result).toHaveLength(1);
    const article = result[0];
    expect(article.id).toBe(1001);
    expect(article.headline).toBe("Fed holds rates steady amid inflation concerns");
    expect(article.source).toBe("Reuters");
    expect(article.url).toBe("https://reuters.com/article/1001");
    expect(article.category).toBe("forex");
    expect(typeof article.datetime).toBe("number");
  });

  it("returns at most 15 articles", () => {
    const raw = Array.from({ length: 25 }, (_, i) => makeFinnhubItem({ id: i, headline: `Headline ${i}` }));
    const result = buildFxNewsArticles(raw);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("filters out items with empty headline", () => {
    const raw = [
      makeFinnhubItem({ headline: "Valid headline" }),
      makeFinnhubItem({ headline: "" }),
      makeFinnhubItem({ headline: undefined }),
    ];
    const result = buildFxNewsArticles(raw);
    expect(result).toHaveLength(1);
    expect(result[0].headline).toBe("Valid headline");
  });

  it("handles missing optional fields with safe defaults", () => {
    const raw = [{ headline: "Bare minimum article" }];
    const result = buildFxNewsArticles(raw);

    expect(result).toHaveLength(1);
    const article = result[0];
    expect(article.source).toBe("Unknown");
    expect(article.url).toBe("");
    expect(article.summary).toBe("");
    expect(article.category).toBe("forex");
    expect(article.datetime).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(buildFxNewsArticles([])).toEqual([]);
  });

  it("assigns sequential index as id when id is missing", () => {
    const raw = [
      { headline: "Article A" },
      { headline: "Article B" },
    ];
    const result = buildFxNewsArticles(raw);
    expect(result[0].id).toBe(0);
    expect(result[1].id).toBe(1);
  });

  it("preserves order of input articles (up to 15)", () => {
    const raw = Array.from({ length: 5 }, (_, i) => makeFinnhubItem({ id: i + 100, headline: `Article ${i}` }));
    const result = buildFxNewsArticles(raw);
    result.forEach((article: FxNewsArticle, i: number) => {
      expect(article.id).toBe(i + 100);
    });
  });

  it("returns all fields as correct types", () => {
    const raw = [makeFinnhubItem()];
    const result = buildFxNewsArticles(raw);
    const a = result[0];
    expect(typeof a.id).toBe("number");
    expect(typeof a.headline).toBe("string");
    expect(typeof a.summary).toBe("string");
    expect(typeof a.source).toBe("string");
    expect(typeof a.url).toBe("string");
    expect(typeof a.datetime).toBe("number");
    expect(typeof a.category).toBe("string");
  });
});
