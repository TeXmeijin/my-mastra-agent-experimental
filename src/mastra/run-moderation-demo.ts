import { runModerationDemo } from './workflows/content-moderation';

// デモを実行
console.log('コンテンツモデレーションデモを開始します...');
runModerationDemo()
  .then(() => {
    console.log('デモが完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  });