# Mastra ワークフロー解説

このドキュメントでは、Mastra フレームワークにおける `Agent`、`Tool`、`Workflow` の関係性、およびワークフローの構築方法について解説します。

## Agent, Tool, Workflow の関係性

### Agent

- **目的:** LLM (大規模言語モデル) との対話やタスク実行の主体です。特定の指示 (instructions) に基づき、自律的に判断し、必要に応じて `Tool` を使用したり、`Workflow` を実行したりします。
- **役割:** ユーザーからの指示を受け取り、LLM に問い合わせ、応答を生成します。複雑なタスクの場合、`Tool` を呼び出して外部機能を利用したり、一連の処理を `Workflow` に委譲したりします。
- **例 (`my-mastra-app/src/mastra/workflows/index.ts` より):**
  ```typescript
  const agent = new Agent({
    name: 'Weather Agent',
    model: llm, // 使用する LLM モデル
    instructions: `...`, // Agent への指示
  });
  ```

### Tool

- **目的:** `Agent` の能力を拡張するための具体的な機能を提供します。外部 API の呼び出し、計算、データベースアクセスなど、LLM 単体では実行できない処理を担当します。
- **役割:** `Agent` は、ユーザーのリクエストに応じて適切な `Tool` を選択し、実行します。`Tool` は特定の入力スキーマと出力スキーマを持ち、`Agent` はこれを理解して `Tool` を利用します。
- **関係性:** `Agent` は `Tool` を**利用する**関係にあります。`Tool` は単独では動作せず、`Agent` から呼び出されることで機能します。
- **例 (Mastra Docs より - Agent が計算ツールを使う例):**
  ```typescript
  const agent = new Agent({
    // ... (Agent の設定)
    tools: {
      calculate: {
        description: "Calculator for mathematical expressions",
        schema: z.object({ expression: z.string() }),
        execute: async ({ expression }) => mathjs.evaluate(expression),
      },
    },
  });
  ```
  この例では、`Agent` は `calculate` という名前の `Tool` を利用して計算を実行できます。

### Workflow

- **目的:** 複数のステップ (処理単位) を組み合わせ、複雑なタスクの実行フローを定義・管理します。ステップの順次実行、並列実行、条件分岐、中断・再開などを制御します。
- **役割:** 一連のタスクを体系的に実行するための設計図です。各ステップ (`Step`) は特定の処理を担当し、`Workflow` はこれらのステップ間の連携やデータの受け渡しを管理します。
- **関係性:** `Workflow` は一連の `Step` を**編成・実行**します。`Agent` は `Workflow` 全体を開始したり、`Workflow` 内の特定の `Step` で `Agent` 自身を呼び出して LLM による処理を行わせることができます。
- **例 (`my-mastra-app/src/mastra/workflows/index.ts` より):**
  ```typescript
  const weatherWorkflow = new Workflow({
    name: 'weather-workflow',
    triggerSchema: z.object({ // ワークフロー開始時の入力データスキーマ
      city: z.string().describe('The city to get the weather for'),
    }),
  })
    .step(fetchWeather) // 最初のステップを追加
    .then(planActivities); // 次のステップを連結
  ```

### 命令関係のまとめ

1.  **ユーザー** → **Agent**: タスクを依頼します。
2.  **Agent** → **LLM**: 自然言語処理や推論を依頼します。
3.  **Agent** → **Tool**: 特定の外部機能の実行を依頼します。
4.  **Agent** → **Workflow**: 一連の複雑な処理フローの実行を開始します。
5.  **Workflow** → **Step**: 定義された順序や条件に従って各処理単位を実行します。
6.  **Step** → **Agent**: (必要に応じて) LLM による判断やテキスト生成を依頼します。
7.  **Step** → **外部 API など**: (必要に応じて) 直接外部リソースにアクセスします (例: 天気 API)。

## ユーザーからの初期入力の受け取り方

ワークフローを開始する際にユーザーからの入力を受け取るには、`Workflow` のコンストラクタで `triggerSchema` を定義します。`triggerSchema` は [Zod](https://zod.dev/) スキーマを使用して、ワークフローが期待する入力データの構造と型を定義します。

- **定義 (`my-mastra-app/src/mastra/workflows/index.ts` より):**
  ```typescript
  const weatherWorkflow = new Workflow({
    name: 'weather-workflow',
    triggerSchema: z.object({
      city: z.string().describe('The city to get the weather for'),
    }),
  });
  ```
  ここでは、`city` という名前の文字列型データが必要であることを定義しています。

- **実行時のデータ渡し (Mastra Docs より):**
  ワークフローを実行する際に、`triggerSchema` に合致するデータを渡します。
  ```typescript
  // プログラムから実行する場合
  const { runId, start } = weatherWorkflow.createRun();
  await start({ triggerData: { city: "Tokyo" } });

  // API経由で実行する場合 (mastra dev 実行時)
  /*
  curl --location 'http://localhost:4111/api/workflows/weather-workflow/start-async' \
       --header 'Content-Type: application/json' \
       --data '{
         "city": "Tokyo"
       }'
  */
  ```

- **Step 内でのアクセス:**
  最初のステップや後続のステップでは、`context.triggerData` を介してこの初期入力データにアクセスできます。
  ```typescript
  const fetchWeather = new Step({
    // ...
    execute: async ({ context }) => {
      // context.triggerData から city を取得
      const triggerData = context.triggerData;
      if (!triggerData?.city) { // triggerSchema で定義されているので型安全
        throw new Error('City not provided in trigger data');
      }
      const city = triggerData.city;
      // ... city を使った処理 ...
    },
  });
  ```
  (注: サンプルコードでは `context.getStepResult<{ city: string }>('trigger')` を使用していますが、Mastra のドキュメントの標準的な方法としては `context.triggerData` を使うのが一般的です。)

## Step 内での LLM 処理: Agent の利用

`Workflow` の `Step` 内で LLM によるテキスト生成や判断を行いたい場合、事前に定義しておいた `Agent` を使用するのがベストプラクティスです。直接 OpenAI SDK などを呼ぶのではなく `Agent` を介することで、以下のメリットがあります。

- **一貫した指示:** `Agent` に設定された `instructions` や `model` が常に適用され、LLM の挙動が一貫します。
- **抽象化:** LLM の詳細な API コールを意識する必要がなく、コードがシンプルになります。
- **Mastra の機能活用:** `Agent` が持つメモリ機能や、Mastra のロギング・監視機能との連携が容易になります。

- **実装例 (`my-mastra-app/src/mastra/workflows/index.ts` の `planActivities` Step より):**
  ```typescript
  const planActivities = new Step({
    id: 'plan-activities',
    description: 'Suggests activities based on weather conditions',
    execute: async ({ context, mastra }) => { // mastra インスタンスも受け取れる
      const forecast = context.getStepResult(fetchWeather); // 前のステップの結果を取得

      if (!forecast || forecast.length === 0) {
        throw new Error('Forecast data not found');
      }

      const prompt = `Based on the following weather forecast for ${forecast[0]?.location}, suggest appropriate activities:
        ${JSON.stringify(forecast, null, 2)}
        `;

      // 事前に定義した agent を使用して LLM に問い合わせ
      const response = await agent.stream([ // .generate() も利用可能
        {
          role: 'user',
          content: prompt,
        },
      ]);

      let activitiesText = '';
      // ストリーミングで結果を受け取る場合
      for await (const chunk of response.textStream) {
        process.stdout.write(chunk); // 任意: コンソールに進捗表示
        activitiesText += chunk;
      }

      return {
        activities: activitiesText, // Step の出力として返す
      };
    },
  });
  ```
  この `planActivities` ステップでは、`fetchWeather` ステップの結果 (天気予報データ) を基にプロンプトを作成し、`agent.stream()` を呼び出して `Agent` に活動計画の生成を依頼しています。

## Step 間の連携方法

`Workflow` 内の `Step` は、前の `Step` の出力結果を受け取って処理を進めることができます。

- **連携の定義:**
  `Workflow` の定義時に `.then()` メソッドを使って `Step` を繋げることで、実行順序とデータの流れが決まります。
  ```typescript
  weatherWorkflow
    .step(fetchWeather) // 最初のステップ
    .then(planActivities); // fetchWeather の次に planActivities を実行
  ```

- **データの受け渡し:**
  後続の `Step` (例: `planActivities`) は、`execute` 関数の引数 `context` を通じて、先行する `Step` (例: `fetchWeather`) の結果にアクセスできます。
  - `context.getStepResult(<StepInstanceOrId>)`: 特定のステップの結果を取得します。ステップのインスタンスまたは ID 文字列を指定します。結果はステップの `outputSchema` で定義された型になります (型安全性を高めるためにジェネリクス `<T>` を使用することも可能)。
  - `context.steps`: 実行済みのすべてのステップの結果を保持するオブジェクトです。`context.steps.<stepId>.output` のようにアクセスできます。

- **実装例 (`my-mastra-app/src/mastra/workflows/index.ts` の `planActivities` Step より):**
  ```typescript
  const planActivities = new Step({
    // ...
    execute: async ({ context, mastra }) => {
      // fetchWeather ステップの結果を取得
      // getStepResult の引数には Step インスタンス (fetchWeather) を渡す
      const forecast = context.getStepResult(fetchWeather);
      // または context.steps.fetchWeather.output でもアクセス可能

      if (!forecast || forecast.length === 0) {
        throw new Error('Forecast data not found');
      }

      // forecast データを使って処理を進める
      const prompt = `Based on the following weather forecast for ${forecast[0]?.location}, suggest appropriate activities: ...`;
      // ... agent.stream() ...

      return { activities: activitiesText };
    },
  });
  ```

このように、`triggerSchema` で初期入力を受け取り、`.then()` でステップを繋げ、`context` オブジェクトを介してステップ間でデータを連携させることで、複雑な処理フローを構築できます。 LLM を利用する場合は `Agent` を介するのが推奨されます。

# Zenn Tech トレンドクイズワークフロー

## 概要

このワークフローは、Zennのトップページからトレンド記事を取得し、それぞれの記事からクイズを自動生成するものです。生成されたクイズは穴埋め形式で、回答できなかった問題に紐づいた記事がわかるようになっています。

## 目的

- 技術トレンドの理解度をクイズ形式で測定
- 知識不足がある分野の記事を効率的に発見
- 最新の技術記事の内容を学習しやすい形で提供

## 構成

このワークフローは以下の4つのステップで構成されています：

1. **トレンド記事取得**：Zennのトップページからトレンド記事のURLと基本情報を取得
2. **記事内容取得**：各記事URLから本文コンテンツを取得
3. **クイズ生成**：各記事の内容から穴埋め形式のクイズを生成
4. **クイズ統合**：全記事から生成されたクイズを整理・統合

## 技術要素

- Mastra Workflow/Step/Agent
- GPT-4o AIモデル
- cheerio（HTMLパース）
- turndown（HTMLからMarkdownへの変換）

## 使用方法

```typescript
import { mastra } from './mastra';

// Zennクイズワークフローを実行
const result = await mastra.runWorkflow('zenn-quiz-workflow');
console.log(result);
```

## 出力例

```
# 2025年4月 技術トレンドクイズ

Zennのトレンド記事から生成された最新技術トレンドに関するクイズです。
あなたの技術知識をテストし、知識の穴を発見しましょう。

## クイズ一覧

1. Googleから新たに【  ①  】 Development kitが発表された（📎@https://zenn.dev/google_cloud_jp/articles/1b1cbd5318bdfe）

...

## 解答

1. ① Agent

...