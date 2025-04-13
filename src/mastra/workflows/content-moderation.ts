import { Workflow, Step } from '@mastra/core/workflows';
import { z } from 'zod';
import { select, input } from '@inquirer/prompts';

// Step 1: Analyze content
const analyzeContent = new Step({
  id: 'analyzeContent',
  outputSchema: z.object({
    content: z.string(),
    aiAnalysisScore: z.number(),
    flaggedCategories: z.array(z.string()).optional(),
  }),
  execute: async ({ context }) => {
    const triggerData = context.triggerData;

    if (!triggerData?.content) {
      throw new Error('Content not provided in trigger data');
    }

    const content = triggerData.content;

    // シミュレーションのためにランダムなスコアを生成
    const aiScore = simulateContentAnalysis(content);

    // AIスコアに基づいてカテゴリをフラグ付け
    const flaggedCategories = [];
    if (aiScore > 0.7) flaggedCategories.push('高リスク');
    if (aiScore > 0.4) flaggedCategories.push('中リスク');
    if (aiScore > 0.2) flaggedCategories.push('要確認');

    return {
      content,
      aiAnalysisScore: aiScore,
      flaggedCategories: flaggedCategories.length > 0 ? flaggedCategories : undefined,
    };
  },
});

// Step 2: Human moderation
const moderateContent = new Step({
  id: 'moderateContent',
  outputSchema: z.object({
    moderationResult: z.string(),
    moderatedContent: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: async ({ context, suspend }) => {
    const analysisResult = context.getStepResult(analyzeContent);

    if (!analysisResult) {
      throw new Error('Analysis result not found');
    }

    // デモのために常に人間のレビューを必要とする（true に設定）
    const needsHumanReview = true; // 常に人間の介入が必要

    // モデレーション判断が必要ない場合は自動承認
    if (!needsHumanReview) {
      return {
        moderationResult: 'approved',
        moderatedContent: analysisResult.content,
        notes: 'Automatically approved (low risk score)',
      };
    }

    // 人間のモデレーターが既に入力を提供した場合（ワークフロー再開後）
    if (context.inputData) {
      const moderatorInput = context.inputData;

      switch (moderatorInput.moderatorDecision) {
        case 'approve':
          return {
            moderationResult: 'approved',
            moderatedContent: analysisResult.content,
            notes: moderatorInput.moderatorNotes || 'Approved by moderator',
          };

        case 'reject':
          return {
            moderationResult: 'rejected',
            moderatedContent: '',
            notes: moderatorInput.moderatorNotes || 'Rejected by moderator',
          };

        case 'modify':
          return {
            moderationResult: 'modified',
            moderatedContent: moderatorInput.modifiedContent || analysisResult?.content || '',
            notes: moderatorInput.moderatorNotes || 'Modified by moderator',
          };

        default:
          return {
            moderationResult: 'rejected',
            moderatedContent: '',
            notes: 'Invalid moderator decision',
          };
      }
    }

    // ワークフローを一時停止して、人間のモデレーターからの入力を待つ
    await suspend({
      content: analysisResult.content,
      aiScore: analysisResult.aiAnalysisScore,
      flaggedCategories: analysisResult.flaggedCategories,
      message: '人間のモデレーション判断が必要です - ワークフローが一時停止されました',
    });

    // この行は suspend が再開された後に実行されます
    // （通常はここに到達しません。モデレーション判断はワークフロー再開後にcontext.inputDataから取得します）
    return {
      moderationResult: 'pending',
      moderatedContent: '',
      notes: 'Waiting for moderation',
    };
  },
});

// Step 3: Apply moderation actions
const applyModeration = new Step({
  id: 'applyModeration',
  outputSchema: z.object({
    finalStatus: z.string(),
    content: z.string().optional(),
    auditLog: z.object({
      originalContent: z.string(),
      moderationResult: z.string(),
      aiScore: z.number(),
      timestamp: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const analysisResult = context.getStepResult(analyzeContent);
    const moderationResult = context.getStepResult(moderateContent);

    if (!analysisResult || !moderationResult) {
      throw new Error('Previous step results not found');
    }

    // 監査ログを作成
    const auditLog = {
      originalContent: analysisResult.content || '',
      moderationResult: moderationResult.moderationResult || 'unknown',
      aiScore: analysisResult.aiAnalysisScore || 0,
      timestamp: new Date().toISOString(),
    };

    // モデレーションアクションの適用
    switch (moderationResult.moderationResult) {
      case 'approved':
        return {
          finalStatus: 'コンテンツが公開されました',
          content: moderationResult.moderatedContent,
          auditLog,
        };

      case 'modified':
        return {
          finalStatus: 'コンテンツが修正され公開されました',
          content: moderationResult.moderatedContent,
          auditLog,
        };

      case 'rejected':
        return {
          finalStatus: 'コンテンツが拒否されました',
          auditLog,
        };

      default:
        return {
          finalStatus: 'モデレーションプロセスでエラーが発生しました',
          auditLog,
        };
    }
  },
});

// ワークフローの構築
export const contentModerationWorkflow = new Workflow({
  name: 'content-moderation-workflow',
  triggerSchema: z.object({
    content: z.string(),
  }),
});

contentModerationWorkflow
  .step(analyzeContent)
  .then(moderateContent)
  .then(applyModeration)
  .commit();

// AIコンテンツ分析シミュレーション用のヘルパー関数
function simulateContentAnalysis(content: string): number {
  // デモのために、常に高いスコアを返す（0.5-0.9の範囲）
  return 0.5 + Math.random() * 0.4;
}

// モデレーションデモを実行する関数
export async function runModerationDemo() {
  // ワークフローの実行
  const run = contentModerationWorkflow.createRun();

  // コンテンツレビューが必要なコンテンツでワークフローを開始
  console.log('コンテンツモデレーションワークフローを開始します...');
  const result = await run.start({
    triggerData: {
      content: 'これは明らかにモデレーションが必要な問題のあるコンテンツです。センシティブな内容を含んでいる可能性があります。モデレーターによる確認が必要です。',
    }
  });

  // ワークフローの状態を確認
  const activePaths = result.activePaths;
  const moderateContentPath = activePaths.get('moderateContent');
  const isReviewStepSuspended = moderateContentPath?.status === 'suspended';

  // ワークフローが一時停止しているかチェック
  if (isReviewStepSuspended && moderateContentPath?.suspendPayload) {
    const { content, aiScore, flaggedCategories, message } = moderateContentPath.suspendPayload;

    console.log('\n===================================');
    console.log('ワークフローステータス: 一時停止中');
    console.log(message);
    console.log('===================================\n');

    console.log('レビュー対象のコンテンツ:');
    console.log(content);
    console.log(`\nAI分析スコア: ${aiScore}`);
    console.log(`フラグカテゴリ: ${flaggedCategories?.join(', ') || 'なし'}\n`);

    // Inquirerを使用してモデレーター判断を収集
    const moderatorDecision = await select({
      message: 'モデレーション判断を選択してください:',
      choices: [
        { name: 'コンテンツをそのまま承認', value: 'approve' },
        { name: 'コンテンツを完全に拒否', value: 'reject' },
        { name: 'コンテンツを修正して公開', value: 'modify' }
      ],
    });

    // 判断に基づく追加情報の収集
    const moderatorNotes = await input({
      message: '判断に関するメモを入力してください:',
    });

    let modifiedContent = '';
    if (moderatorDecision === 'modify') {
      modifiedContent = await input({
        message: '修正したコンテンツを入力:',
        default: content,
      });
    }

    console.log('\nモデレーション判断を送信しています...');
    console.log('ワークフローを再開します...');

    // モデレーターの入力でワークフローを再開
    const resumeResult = await run.resume({
      stepId: 'moderateContent',
      context: {
        moderatorDecision,
        moderatorNotes,
        modifiedContent,
      },
    });

    const applyModerationResult = resumeResult?.results?.applyModeration;
    if (applyModerationResult?.status === 'success') {
      console.log('\n===================================');
      console.log(`モデレーション完了: ${applyModerationResult.output.finalStatus}`);
      console.log('===================================\n');

      if (applyModerationResult.output.content) {
        console.log('公開されたコンテンツ:');
        console.log(applyModerationResult.output.content);
      }
    }

    return resumeResult;
  }

  console.log('ワークフローは人間の介入なしで完了しました:', result.results);
  return result;
}