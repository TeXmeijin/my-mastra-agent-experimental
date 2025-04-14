import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { ZennArticle, ZennArticleContent } from '../types/zenn';

// HTMLをMarkdownに変換するためのTurndownサービス
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Zennのトップページからトレンド記事を取得する
 */
export async function fetchTrendingArticles(): Promise<ZennArticle[]> {
  try {
    const response = await fetch('https://zenn.dev/');
    if (!response.ok) {
      throw new Error(`Failed to fetch Zenn top page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const articles: ZennArticle[] = [];

    // Tech トレンドの記事を抽出
    $('article').each((_, articleElement) => {
      const $article = $(articleElement);

      // 記事のリンク要素を取得（タイトルを含む要素）
      const titleElement = $article.find('h2[class*="ArticleList_title"]');
      const title = titleElement.text().trim();

      // 記事へのリンクURLを取得
      const linkElement = $article.find('a[class*="ArticleList_link"]');
      const url = linkElement.attr('href');
      if (!url) return;

      // 絵文字を取得（存在する場合）
      const emojiElement = $article.find('a[class*="ArticleList_emoji"] span[class*="Emoji_native"]');
      const emoji = emojiElement.text().trim();

      // 著者名を取得
      const authorElement = $article.find('div[class*="ArticleList_userName"] a');
      const author = authorElement.text().trim();

      // フルURLを構築（相対URLの場合）
      const fullUrl = url.startsWith('http') ? url : `https://zenn.dev${url}`;

      // 必要な情報が揃っている場合のみ追加
      if (title) {
        articles.push({
          title,
          url: fullUrl,
          emoji,
          author,
        });
      }
    });

    return articles.slice(0, 2);
  } catch (error) {
    console.error('Error fetching trending articles:', error);
    throw error;
  }
}

/**
 * 特定の記事URLから記事内容を取得する
 */
export async function fetchArticleContent(article: ZennArticle): Promise<ZennArticleContent> {
  try {
    const response = await fetch(article.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 記事本文を取得
    const articleBody = $('article').html() || '';

    // HTMLをMarkdownに変換
    const markdown = turndownService.turndown(articleBody);

    return {
      ...article,
      content: markdown,
    };
  } catch (error) {
    console.error(`Error fetching article content for ${article.url}:`, error);
    throw error;
  }
}