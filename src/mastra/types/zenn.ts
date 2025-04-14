import { z } from 'zod';

// Zennの記事情報の型定義
export const ZennArticleSchema = z.object({
  title: z.string().describe('記事のタイトル'),
  url: z.string().url().describe('記事のURL'),
  emoji: z.string().optional().describe('記事のアイキャッチ絵文字'),
  author: z.string().optional().describe('記事の著者名'),
});

export type ZennArticle = z.infer<typeof ZennArticleSchema>;

// 記事コンテンツ含む拡張型
export const ZennArticleContentSchema = ZennArticleSchema.extend({
  content: z.string().describe('記事の本文コンテンツ'),
});

export type ZennArticleContent = z.infer<typeof ZennArticleContentSchema>;

// クイズ問題の型定義
export const QuizItemSchema = z.object({
  question: z.string().describe('問題文'),
  answer: z.string().describe('答え'),
  options: z.array(z.string()).optional().describe('選択肢（ある場合）'),
  sourceUrl: z.string().url().describe('出題元の記事URL'),
  sourceTitle: z.string().describe('出題元の記事タイトル'),
});

export type QuizItem = z.infer<typeof QuizItemSchema>;

// 複数のクイズをまとめたテストの型定義
export const QuizSetSchema = z.object({
  title: z.string().describe('クイズセットのタイトル'),
  description: z.string().describe('クイズセットの説明'),
  quizItems: z.array(QuizItemSchema).describe('クイズ問題のリスト'),
  createdAt: z.string().describe('作成日時'),
});

export type QuizSet = z.infer<typeof QuizSetSchema>;