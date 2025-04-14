import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { quizGeneratorAgent, quizIntegratorAgent } from '../agents/quiz-agent';
import { fetchTrendingArticles, fetchArticleContent } from '../tools/zenn-scraper';
import { QuizItem, QuizItemSchema, QuizSet, QuizSetSchema, ZennArticle, ZennArticleContent } from '../types/zenn';

// ステップ1: Zennからトレンド記事を取得するステップ
const fetchTrendingArticlesStep = new Step({
  id: 'fetch-trending-articles',
  description: 'Zennのトップページからトレンド記事を取得します',
  outputSchema: z.array(z.object({
    title: z.string(),
    url: z.string(),
    emoji: z.string().optional(),
    author: z.string().optional(),
  })),
  execute: async () => {
    console.log('トレンド記事を取得中...');
    const articles = await fetchTrendingArticles();
    console.log(`${articles.length}件のトレンド記事を取得しました`);
    return articles;
  },
});

// ステップ2: 記事の内容を取得するステップ
const fetchArticleContentsStep = new Step({
  id: 'fetch-article-contents',
  description: '各記事の内容を取得します',
  outputSchema: z.array(z.object({
    title: z.string(),
    url: z.string(),
    emoji: z.string().optional(),
    author: z.string().optional(),
    content: z.string(),
  })),
  execute: async ({ context }) => {
    const articles = context?.getStepResult<ZennArticle[]>('fetch-trending-articles') || [];
    if (articles.length === 0) {
      throw new Error('記事が見つかりませんでした');
    }

    console.log('記事内容を取得中...');
    const articlesWithContent: ZennArticleContent[] = [];

    // 並行処理を制限するために5件ずつ処理
    const batchSize = 5;
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((article: ZennArticle) =>
          fetchArticleContent(article)
            .catch(error => {
              console.error(`記事「${article.title}」の取得に失敗: ${error.message}`);
              return { ...article, content: '内容の取得に失敗しました' };
            })
        )
      );
      articlesWithContent.push(...batchResults);
    }

    console.log(`${articlesWithContent.length}件の記事内容を取得しました`);
    return articlesWithContent;
  },
});

// ステップ3: 各記事からクイズを生成するステップ
const generateQuizzesStep = new Step({
  id: 'generate-quizzes',
  description: '各記事からクイズを生成します',
  outputSchema: z.array(QuizItemSchema),
  execute: async ({ context, mastra }) => {
    const articlesWithContent = context?.getStepResult<ZennArticleContent[]>('fetch-article-contents') || [];
    if (articlesWithContent.length === 0) {
      throw new Error('記事内容が見つかりませんでした');
    }

    console.log('クイズを生成中...');
    const allQuizzes: QuizItem[] = [];

    // 各記事からクイズを生成
    for (const article of articlesWithContent) {
      try {
        console.log(`「${article.title}」からクイズを生成中...`);

        const prompt = `
          以下の技術記事からクイズを作成してください:

          タイトル: ${article.title}
          URL: ${article.url}
          ${article.author ? `著者: ${article.author}` : ''}

          記事内容:
          ${article.content.substring(0, 8000)} ${article.content.length > 8000 ? '...(以下省略)' : ''}

          この記事から1〜3問程度の穴埋め形式のクイズを作成してください。
        `;

        const response = await quizGeneratorAgent.stream([
          {
            role: 'user',
            content: prompt,
          },
        ]);

        let quizText = '';
        for await (const chunk of response.textStream) {
          process.stdout.write(chunk);
          quizText += chunk;
        }

        // クイズテキストをパースしてQuizItem配列に変換
        const quizItems = parseQuizText(quizText, article);
        allQuizzes.push(...quizItems);
      } catch (error) {
        console.error(`記事「${article.title}」のクイズ生成に失敗: ${error}`);
      }
    }

    console.log(`${allQuizzes.length}問のクイズを生成しました`);
    return allQuizzes;
  },
});

// ステップ4: 生成されたクイズを統合するステップ
const integrateQuizzesStep = new Step({
  id: 'integrate-quizzes',
  description: '生成されたクイズを統合します',
  outputSchema: QuizSetSchema,
  execute: async ({ context, mastra }) => {
    const quizItems = context?.getStepResult<QuizItem[]>('generate-quizzes') || [];
    if (quizItems.length === 0) {
      throw new Error('クイズが生成されませんでした');
    }

    console.log('クイズを統合中...');

    const prompt = `
      以下の${quizItems.length}問のクイズを整理・統合してください:

      ${JSON.stringify(quizItems, null, 2)}
    `;

    const response = await quizIntegratorAgent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let integratedQuizText = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      integratedQuizText += chunk;
    }

    // 統合されたクイズセットを作成
    const quizSet: QuizSet = {
      title: '最新技術トレンドクイズ',
      description: 'Zennのトレンド記事から生成された最新技術トレンドに関するクイズです。',
      quizItems: quizItems,
      createdAt: new Date().toISOString(),
    };

    return quizSet;
  },
});

// クイズテキストをパースしてQuizItem配列に変換する関数
function parseQuizText(quizText: string, article: ZennArticleContent): QuizItem[] {
  const quizItems: QuizItem[] = [];

  // 「【問題】」と「【答え】」で分割
  const sections = quizText.split(/【問題】|【答え】/).filter(Boolean);

  for (let i = 0; i < sections.length; i += 2) {
    if (i + 1 >= sections.length) break;

    const questionText = sections[i].trim();
    const answerText = sections[i + 1].trim();

    // 選択肢がある場合は抽出（今回は実装しない）

    quizItems.push({
      question: questionText,
      answer: answerText,
      sourceUrl: article.url,
      sourceTitle: article.title,
    });
  }

  return quizItems;
}

// ワークフローの作成と登録
const zennQuizWorkflow = new Workflow({
  name: 'zenn-quiz-workflow',
})
  .step(fetchTrendingArticlesStep)
  .then(fetchArticleContentsStep)
  .then(generateQuizzesStep)
  .then(integrateQuizzesStep);

zennQuizWorkflow.commit();

export { zennQuizWorkflow };